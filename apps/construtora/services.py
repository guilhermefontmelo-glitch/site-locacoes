"""Camada de Serviços (Service Layer): Motor financeiro 100% `Decimal` (`SAC` / `PRICE`)."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, localcontext

from django.conf import settings

from apps.construtora.forms import ModalidadeFinanciamentoChoices, SistemaAmortizacaoChoices
from core.security import build_whatsapp_url

_TWO_PLACES: Decimal = Decimal("0.01")
_FOUR_PLACES: Decimal = Decimal("0.0001")
_ZERO: Decimal = Decimal("0.00")
_ONE: Decimal = Decimal("1")
_TWELVE: Decimal = Decimal("12")
_HUNDRED: Decimal = Decimal("100")


@dataclass(frozen=True, slots=True)
class ResultadoPreAnaliseMCMV:
    """Objeto de retorno tipado de compatibilidade da pré-análise habitacional."""

    nome_cliente: str
    faixa_titulo: str
    beneficio_destaque: str
    parcela_teto_formatada: str
    potencial_obra_formatado: str
    modalidade_label: str
    orientacao_tecnica: str
    whatsapp_url: str


@dataclass(frozen=True, slots=True)
class ResultadoSimulacaoHabitacional:
    """Resultado completo e determinístico da simulação habitacional (`SAC` / `PRICE`)."""

    nome_cliente: str
    faixa_titulo: str
    sistema_amortizacao: str
    prazo_meses: int
    taxa_anual_formatada: str
    taxa_mensal_formatada: str
    parcela_teto_formatada: str
    primeira_parcela_formatada: str
    ultima_parcela_formatada: str
    valor_obra_formatado: str
    valor_financiado_formatado: str
    subsidio_estimado_formatado: str
    entrada_informada_formatada: str
    entrada_minima_formatada: str
    deficit_entrada_formatado: str
    potencial_obra_formatado: str
    ltv_percentual: int
    viavel_com_entrada_atual: bool
    modalidade_label: str
    beneficio_destaque: str
    orientacao_tecnica: str
    whatsapp_url: str


def _quantize_money(valor: Decimal) -> Decimal:
    """Arredonda um `Decimal` para centavos exatos com `ROUND_HALF_UP`."""
    return valor.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def _format_brl(valor: Decimal) -> str:
    """Formata um valor `Decimal` em moeda brasileira `R$ 0.000,00` sem depender de locale OS."""
    quantized: Decimal = _quantize_money(valor)
    sign_prefix: str = "-" if quantized < _ZERO else ""
    abs_val: Decimal = abs(quantized)
    inteiro_str, centavos_str = f"{abs_val:.2f}".split(".")
    inteiro_formatado = f"{int(inteiro_str):,}".replace(",", ".")
    return f"{sign_prefix}R$ {inteiro_formatado},{centavos_str}"


def _format_percent(taxa_decimal: Decimal, *, casas: int = 2) -> str:
    """Formata taxa fracionária `Decimal` (ex.: `0.0425`) como percentual (`4,25%`)."""
    fator_quantize = Decimal("0.01") if casas == 2 else _FOUR_PLACES
    pct = (taxa_decimal * _HUNDRED).quantize(fator_quantize, rounding=ROUND_HALF_UP)
    texto = f"{pct:.{casas}f}".replace(".", ",")
    return f"{texto}%"


def _enquadrar_faixa_nordeste(
    *,
    renda_familiar: Decimal,
    valor_obra: Decimal,
    modalidade: str,
    sistema_amortizacao: str,
    possui_fgts: bool,
    possui_dependentes: bool,
) -> tuple[str, str, Decimal, Decimal, Decimal, Decimal]:
    """Determina faixa, benefício, teto da faixa, taxa anual, subsídio e teto LTV em `Decimal`."""
    fator_dependente: Decimal = _ONE if possui_dependentes else Decimal("0.50")

    if renda_familiar <= Decimal("2850.00"):
        faixa_titulo = "Minha Casa Minha Vida — Faixa 1"
        beneficio_destaque = (
            "Elegível às menores taxas históricas da Caixa para a Região Nordeste e ao "
            "maior patamar de subsídio habitacional para reduzir a entrada."
        )
        teto_faixa = Decimal("190000.00")
        taxa_anual = (
            Decimal("0.0400")
            if (renda_familiar <= Decimal("2160.00") or possui_fgts)
            else Decimal("0.0425")
        )
        # Interpolação linear Decimal entre R$ 55.000 (<= R$ 1.800) e R$ 26.000 (R$ 2.850)
        if renda_familiar <= Decimal("1800.00"):
            subsidio_base = Decimal("55000.00")
        else:
            proporcao = (renda_familiar - Decimal("1800.00")) / Decimal("1050.00")
            subsidio_base = Decimal("55000.00") - (Decimal("29000.00") * proporcao)
        subsidio = _quantize_money(
            min(subsidio_base * fator_dependente, valor_obra * Decimal("0.25"))
        )
        ltv = (
            Decimal("0.90")
            if modalidade == ModalidadeFinanciamentoChoices.TERRENO_PROPRIO
            else Decimal("0.80")
        )
    elif renda_familiar <= Decimal("4700.00"):
        faixa_titulo = "Minha Casa Minha Vida — Faixa 2"
        beneficio_destaque = (
            "Equilíbrio ideal entre capacidade construtiva, juros reduzidos do Minha Casa "
            "Minha Vida Regional e subsídio complementar na entrada."
        )
        teto_faixa = Decimal("264000.00")
        taxa_anual = Decimal("0.0600") if possui_fgts else Decimal("0.0650")
        proporcao = (Decimal("4700.00") - renda_familiar) / Decimal("1850.00")
        subsidio_base = Decimal("6000.00") + (Decimal("29000.00") * proporcao)
        subsidio = _quantize_money(
            min(subsidio_base * fator_dependente, valor_obra * Decimal("0.20"))
        )
        ltv = (
            Decimal("0.90")
            if modalidade == ModalidadeFinanciamentoChoices.TERRENO_PROPRIO
            else Decimal("0.80")
        )
    elif renda_familiar <= Decimal("8600.00"):
        faixa_titulo = "Minha Casa Minha Vida — Faixa 3"
        beneficio_destaque = (
            "Enquadramento no teto ampliado do programa (obras de até R$ 350 mil) com taxas "
            "significativamente inferiores ao crédito imobiliário tradicional."
        )
        teto_faixa = Decimal("350000.00")
        taxa_anual = Decimal("0.0766") if possui_fgts else Decimal("0.0816")
        subsidio = _ZERO
        ltv = (
            Decimal("0.90")
            if modalidade == ModalidadeFinanciamentoChoices.TERRENO_PROPRIO
            else Decimal("0.80")
        )
    else:
        faixa_titulo = "Caixa Habitacional — Linha SBPE Personalizada"
        beneficio_destaque = (
            "Perfil indicado para projetos arquitetônicos personalizados de médio e alto "
            "padrão em Terreno + Construção ou Construção em Lote Próprio."
        )
        teto_faixa = Decimal("1500000.00")
        taxa_anual = Decimal("0.0999") if possui_fgts else Decimal("0.1049")
        subsidio = _ZERO
        ltv = (
            Decimal("0.70")
            if sistema_amortizacao == SistemaAmortizacaoChoices.PRICE
            else Decimal("0.80")
        )

    return faixa_titulo, beneficio_destaque, teto_faixa, taxa_anual, subsidio, ltv


def simular_financiamento_habitacional(
    *,
    renda_familiar: Decimal,
    valor_obra: Decimal = Decimal("220000.00"),
    entrada_fgts: Decimal = Decimal("0.00"),
    prazo_meses: int = 360,
    sistema_amortizacao: str = SistemaAmortizacaoChoices.SAC,
    modalidade: str = ModalidadeFinanciamentoChoices.TERRENO_E_CONSTRUCAO,
    possui_fgts: bool = True,
    possui_dependentes: bool = True,
    nome: str = "",
    telefone: str = "",
    cidade_obra: str = "Viçosa do Ceará - CE",
) -> ResultadoSimulacaoHabitacional:
    """Executa simulação financeira `SAC`/`PRICE` usando exclusivamente `decimal.Decimal`."""
    sistema_norm: str = (
        SistemaAmortizacaoChoices.PRICE
        if sistema_amortizacao.upper() == SistemaAmortizacaoChoices.PRICE
        else SistemaAmortizacaoChoices.SAC
    )
    prazo_seguro: int = min(420, max(120, int(prazo_meses)))
    n_dec: Decimal = Decimal(prazo_seguro)

    with localcontext() as ctx:
        ctx.prec = 28
        ctx.rounding = ROUND_HALF_UP

        (
            faixa_titulo,
            beneficio_destaque,
            teto_faixa,
            taxa_anual,
            subsidio_estimado,
            ltv_max,
        ) = _enquadrar_faixa_nordeste(
            renda_familiar=renda_familiar,
            valor_obra=valor_obra,
            modalidade=modalidade,
            sistema_amortizacao=sistema_norm,
            possui_fgts=possui_fgts,
            possui_dependentes=possui_dependentes,
        )

        # Taxa efetiva mensal equivalente em Decimal puro: (1 + i_a)^(1/12) - 1
        taxa_mensal: Decimal = ((_ONE + taxa_anual).ln() / _TWELVE).exp() - _ONE
        parcela_teto: Decimal = _quantize_money(renda_familiar * Decimal("0.30"))

        fator_acumulado: Decimal = (_ONE + taxa_mensal) ** prazo_seguro
        if sistema_norm == SistemaAmortizacaoChoices.SAC:
            pv_max_renda: Decimal = parcela_teto / ((_ONE / n_dec) + taxa_mensal)
        else:
            pv_max_renda = parcela_teto * (
                (fator_acumulado - _ONE) / (taxa_mensal * fator_acumulado)
            )
        pv_max_renda = _quantize_money(pv_max_renda)

        teto_ltv_obra: Decimal = _quantize_money(valor_obra * ltv_max)
        pv_teto_aplicavel: Decimal = min(pv_max_renda, teto_ltv_obra, teto_faixa)

        necessidade_liquida: Decimal = max(_ZERO, valor_obra - entrada_fgts - subsidio_estimado)
        valor_financiado: Decimal = _quantize_money(min(pv_teto_aplicavel, necessidade_liquida))

        entrada_minima: Decimal = _quantize_money(
            max(_ZERO, valor_obra - pv_teto_aplicavel - subsidio_estimado)
        )
        deficit_entrada: Decimal = _quantize_money(max(_ZERO, entrada_minima - entrada_fgts))
        viavel_com_entrada_atual: bool = deficit_entrada <= _ZERO and valor_obra <= teto_faixa

        potencial_ltv: Decimal = _quantize_money(pv_max_renda / ltv_max)
        potencial_composto: Decimal = _quantize_money(
            pv_max_renda + entrada_fgts + subsidio_estimado
        )
        potencial_obra: Decimal = _quantize_money(
            min(teto_faixa, max(potencial_ltv, potencial_composto))
        )

        base_calculo_parcela: Decimal = (
            valor_financiado if valor_financiado > _ZERO else pv_teto_aplicavel
        )
        if base_calculo_parcela <= _ZERO:
            primeira_parcela = _ZERO
            ultima_parcela = _ZERO
        elif sistema_norm == SistemaAmortizacaoChoices.SAC:
            amortizacao_mensal = base_calculo_parcela / n_dec
            primeira_parcela = _quantize_money(
                amortizacao_mensal + (base_calculo_parcela * taxa_mensal)
            )
            ultima_parcela = _quantize_money(amortizacao_mensal * (_ONE + taxa_mensal))
        else:
            parcela_fixa = _quantize_money(
                base_calculo_parcela * ((taxa_mensal * fator_acumulado) / (fator_acumulado - _ONE))
            )
            primeira_parcela = parcela_fixa
            ultima_parcela = parcela_fixa

        ltv_percentual: int = int((ltv_max * _HUNDRED).quantize(_ONE, rounding=ROUND_HALF_UP))

    mapa_modalidade: dict[str, str] = dict(ModalidadeFinanciamentoChoices.CHOICES)
    modalidade_label: str = mapa_modalidade.get(modalidade, "Construção Financiada Caixa")
    nome_exibicao: str = nome.strip() or "Visitante"
    cidade_limpa: str = cidade_obra.strip() or "Viçosa do Ceará - CE"

    if valor_obra > teto_faixa:
        orientacao_tecnica = (
            f"O valor simulado ({_format_brl(valor_obra)}) supera o teto da faixa atual "
            f"({_format_brl(teto_faixa)}). Ajustamos o cálculo ao limite financiável e nossa "
            "engenharia pode adequar o projeto ou enquadrar na linha Caixa SBPE."
        )
    elif viavel_com_entrada_atual:
        orientacao_tecnica = (
            "Excelente cenário: sua entrada/FGTS somada ao subsídio estimado cobre a parcela "
            "própria da obra e mantém a prestação dentro do limite de 30% da renda."
        )
    else:
        orientacao_tecnica = (
            f"Para este valor de obra no prazo de {prazo_seguro} meses ({sistema_norm}), "
            f"a entrada mínima estimada é de {_format_brl(entrada_minima)} "
            f"(diferença de {_format_brl(deficit_entrada)} ajustável no cronograma ou planta)."
        )

    linhas_msg: list[str] = [
        "Olá, equipe Rocha Construtora! Fiz minha simulação habitacional no site:",
        f"• Perfil: {faixa_titulo}",
    ]
    if nome.strip():
        linhas_msg.append(f"• Nome: {nome.strip()}")
    if telefone.strip():
        linhas_msg.append(f"• WhatsApp: {telefone.strip()}")
    financiado_fmt: str = _format_brl(valor_financiado)
    linhas_msg.extend(
        [
            f"• Cidade da Obra: {cidade_limpa}",
            f"• Modalidade: {modalidade_label}",
            f"• Renda Familiar: {_format_brl(renda_familiar)}",
            f"• Valor Estimado da Obra: {_format_brl(valor_obra)}",
            f"• Entrada / FGTS Informado: {_format_brl(entrada_fgts)}",
            f"• Valor Financiado ({sistema_norm} / {prazo_seguro}m): {financiado_fmt}",
            f"• 1ª Parcela Estimada: {_format_brl(primeira_parcela)} "
            f"(Última: {_format_brl(ultima_parcela)})",
            "Gostaria de validar meu dossiê oficial junto à engenharia Caixa!",
        ]
    )

    phone_construtora: str = getattr(settings, "ROCHA_WHATSAPP_CONSTRUTORA", "5588992258807")
    whatsapp_url: str = build_whatsapp_url(
        phone_e164=phone_construtora,
        message="\n".join(linhas_msg),
    )

    return ResultadoSimulacaoHabitacional(
        nome_cliente=nome_exibicao,
        faixa_titulo=faixa_titulo,
        sistema_amortizacao=sistema_norm,
        prazo_meses=prazo_seguro,
        taxa_anual_formatada=f"{_format_percent(taxa_anual, casas=2)} a.a.",
        taxa_mensal_formatada=f"{_format_percent(taxa_mensal, casas=4)} a.m.",
        parcela_teto_formatada=_format_brl(parcela_teto),
        primeira_parcela_formatada=_format_brl(primeira_parcela),
        ultima_parcela_formatada=_format_brl(ultima_parcela),
        valor_obra_formatado=_format_brl(valor_obra),
        valor_financiado_formatado=_format_brl(valor_financiado),
        subsidio_estimado_formatado=_format_brl(subsidio_estimado),
        entrada_informada_formatada=_format_brl(entrada_fgts),
        entrada_minima_formatada=_format_brl(entrada_minima),
        deficit_entrada_formatado=_format_brl(deficit_entrada),
        potencial_obra_formatado=_format_brl(potencial_obra),
        ltv_percentual=ltv_percentual,
        viavel_com_entrada_atual=viavel_com_entrada_atual,
        modalidade_label=modalidade_label,
        beneficio_destaque=beneficio_destaque,
        orientacao_tecnica=orientacao_tecnica,
        whatsapp_url=whatsapp_url,
    )


def calcular_pre_analise_mcmv(
    *,
    nome: str,
    telefone: str,
    renda_familiar: Decimal,
    modalidade: str,
    possui_fgts: bool,
    cidade_obra: str,
) -> ResultadoPreAnaliseMCMV:
    """Mantém contrato legado de pré-análise habitacional delegando ao motor `Decimal`."""
    simulacao = simular_financiamento_habitacional(
        renda_familiar=renda_familiar,
        modalidade=modalidade,
        possui_fgts=possui_fgts,
        nome=nome,
        telefone=telefone,
        cidade_obra=cidade_obra,
    )
    return ResultadoPreAnaliseMCMV(
        nome_cliente=simulacao.nome_cliente,
        faixa_titulo=simulacao.faixa_titulo,
        beneficio_destaque=simulacao.beneficio_destaque,
        parcela_teto_formatada=simulacao.parcela_teto_formatada,
        potencial_obra_formatado=simulacao.potencial_obra_formatado,
        modalidade_label=simulacao.modalidade_label,
        orientacao_tecnica=simulacao.orientacao_tecnica,
        whatsapp_url=simulacao.whatsapp_url,
    )
