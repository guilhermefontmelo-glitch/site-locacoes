"""Camada de Serviços (Service Layer): Cálculo de pré-enquadramento MCMV e conversão."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings

from apps.construtora.forms import ModalidadeFinanciamentoChoices
from core.security import build_whatsapp_url


@dataclass(frozen=True, slots=True)
class ResultadoPreAnaliseMCMV:
    """Objeto de retorno tipado da pré-análise de financiamento habitacional."""

    nome_cliente: str
    faixa_titulo: str
    beneficio_destaque: str
    parcela_teto_formatada: str
    potencial_obra_formatado: str
    modalidade_label: str
    orientacao_tecnica: str
    whatsapp_url: str


def _format_brl(valor: Decimal) -> str:
    """Formata um valor `Decimal` em moeda brasileira `R$ 0.000,00` sem depender de locale OS."""
    quantized: Decimal = valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    inteiro_str, centavos_str = f"{quantized:.2f}".split(".")
    inteiro_formatado = f"{int(inteiro_str):,}".replace(",", ".")
    return f"R$ {inteiro_formatado},{centavos_str}"


def calcular_pre_analise_mcmv(
    *,
    nome: str,
    telefone: str,
    renda_familiar: Decimal,
    modalidade: str,
    possui_fgts: bool,
    cidade_obra: str,
) -> ResultadoPreAnaliseMCMV:
    """Enquadra a renda familiar nas faixas MCMV/Caixa utilizando exclusivamente `Decimal`."""
    parcela_teto: Decimal = (renda_familiar * Decimal("0.30")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    if renda_familiar <= Decimal("2850.00"):
        faixa_titulo = "Minha Casa Minha Vida — Faixa 1"
        beneficio_destaque = (
            "Elegível às menores taxas de juros da Caixa no Nordeste e alto potencial de "
            "subsídio governamental (conforme análise cadastral e composição familiar)."
        )
        fator_multiplicador = Decimal("165")
    elif renda_familiar <= Decimal("4700.00"):
        faixa_titulo = "Minha Casa Minha Vida — Faixa 2"
        beneficio_destaque = (
            "Excelente equilíbrio entre potencial construtivo, taxas reduzidas MCMV Regional "
            "e possibilidade de subsídio complementar na entrada."
        )
        fator_multiplicador = Decimal("175")
    elif renda_familiar <= Decimal("8600.00"):
        faixa_titulo = "Minha Casa Minha Vida — Faixa 3"
        beneficio_destaque = (
            "Enquadramento no teto ampliado do programa (obras de até R$ 350 mil) com taxas "
            "significativamente menores que o crédito imobiliário tradicional."
        )
        fator_multiplicador = Decimal("180")
    else:
        faixa_titulo = "Caixa Habitacional — Linha SBPE Personalizada"
        beneficio_destaque = (
            "Perfil ideal para projetos arquitetônicos personalizados de médio e alto padrão "
            "com financiamento de Terreno + Construção ou Obra em Lote Próprio."
        )
        fator_multiplicador = Decimal("185")

    potencial_bruto: Decimal = parcela_teto * fator_multiplicador
    if renda_familiar <= Decimal("8600.00") and potencial_bruto > Decimal("350000.00"):
        potencial_bruto = Decimal("350000.00")

    mapa_modalidade: dict[str, str] = dict(ModalidadeFinanciamentoChoices.CHOICES)
    modalidade_label: str = mapa_modalidade.get(modalidade, "Construção Financiada Caixa")

    fgts_nota: str = (
        "Com uso estratégico do seu FGTS, é possível reduzir ou zerar o desembolso de entrada."
        if possui_fgts
        else "Mesmo sem FGTS, planejamos o projeto e o cronograma dentro da sua capacidade."
    )

    parcela_fmt: str = _format_brl(parcela_teto)
    potencial_fmt: str = _format_brl(potencial_bruto)
    renda_fmt: str = _format_brl(renda_familiar)
    fgts_resumo: str = "Sim" if possui_fgts else "Não"

    mensagem_whatsapp: str = (
        f"Olá, equipe Rocha Construtora! Fiz minha pré-análise no site:\n"
        f"• Nome: {nome}\n"
        f"• WhatsApp: {telefone}\n"
        f"• Cidade da Obra: {cidade_obra}\n"
        f"• Modalidade: {modalidade_label}\n"
        f"• Renda Familiar: {renda_fmt} ({faixa_titulo})\n"
        f"• Possui FGTS: {fgts_resumo}\n"
        f"Gostaria de agendar minha análise oficial na Caixa!"
    )

    phone_construtora: str = getattr(settings, "ROCHA_WHATSAPP_CONSTRUTORA", "5588992258807")
    whatsapp_url: str = build_whatsapp_url(
        phone_e164=phone_construtora,
        message=mensagem_whatsapp,
    )

    return ResultadoPreAnaliseMCMV(
        nome_cliente=nome,
        faixa_titulo=faixa_titulo,
        beneficio_destaque=beneficio_destaque,
        parcela_teto_formatada=parcela_fmt,
        potencial_obra_formatado=potencial_fmt,
        modalidade_label=modalidade_label,
        orientacao_tecnica=fgts_nota,
        whatsapp_url=whatsapp_url,
    )

