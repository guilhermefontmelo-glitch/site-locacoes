"""Formulários validados estritamente no backend para simulação Caixa / Minha Casa Minha Vida."""

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django import forms

from core.validators import sanitize_plain_text, validate_brazilian_phone

_BRL_PREFIX_RE: re.Pattern[str] = re.compile(r"[rR]\$|\s")


def _format_brl_label(valor: Decimal) -> str:
    """Formata um `Decimal` como `R$ 0.000,00` para mensagens de validação."""
    quantized: Decimal = valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    inteiro_str, centavos_str = f"{quantized:.2f}".split(".")
    inteiro_fmt = f"{int(inteiro_str):,}".replace(",", ".")
    return f"R$ {inteiro_fmt},{centavos_str}"


def parse_brl_decimal(raw_value: object) -> Decimal:
    """Converte strings monetárias BRL (`R$ 3.500,00`) ou decimais (`3500.00`) em `Decimal`."""
    if isinstance(raw_value, Decimal):
        return raw_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    cleaned: str = _BRL_PREFIX_RE.sub("", str(raw_value or "")).strip()
    if not cleaned:
        raise InvalidOperation("Valor monetário vazio.")

    if "," in cleaned:
        normalized = cleaned.replace(".", "").replace(",", ".")
    elif "." in cleaned:
        parts = cleaned.split(".")
        normalized = cleaned if len(parts) == 2 and len(parts[1]) in (1, 2) else "".join(parts)
    else:
        normalized = cleaned

    parsed = Decimal(normalized)
    if not parsed.is_finite():
        raise InvalidOperation("Valor monetário não finito.")
    return parsed.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class BRLDecimalField(forms.Field):
    """Campo monetário que aceita máscara brasileira (`R$ 3.500,00`) e formato numérico puro."""

    widget = forms.TextInput

    def __init__(
        self,
        *,
        label: str = "",
        required: bool = True,
        initial: str | Decimal | None = None,
        help_text: str = "",
        widget: forms.Widget | None = None,
        max_length: int = 24,
        strip: bool = True,
        min_value: Decimal | None = None,
        max_value: Decimal | None = None,
        default_if_blank: Decimal | None = None,
        error_messages: dict[str, str] | None = None,
    ) -> None:
        """Inicializa limites `Decimal` e valor padrão opcional sem `MaxLengthValidator` de str."""
        self.max_length = max_length
        self.strip = strip
        self.min_value = min_value
        self.max_value = max_value
        self.default_if_blank = default_if_blank
        super().__init__(
            label=label,
            required=required,
            initial=initial,
            help_text=help_text,
            widget=widget,
            error_messages=error_messages,
        )

    def to_python(self, value: object) -> Decimal | None:
        """Sanitiza e valida a representação monetária retornando `Decimal` exato."""
        if value in self.empty_values:
            return self.default_if_blank

        raw_str: str = str(value).strip() if self.strip else str(value)
        if not raw_str:
            return self.default_if_blank

        if len(raw_str) > self.max_length:
            msg = f"Informe no máximo {self.max_length} caracteres neste campo."
            raise forms.ValidationError(msg)

        try:
            decimal_val = parse_brl_decimal(raw_str)
        except (InvalidOperation, ValueError) as exc:
            raise forms.ValidationError(
                self.error_messages["invalid"],
                code="invalid",
            ) from exc

        if self.min_value is not None and decimal_val < self.min_value:
            msg = self.error_messages.get("min_value") or (
                f"O valor mínimo permitido para este campo é {_format_brl_label(self.min_value)}."
            )
            raise forms.ValidationError(msg, code="min_value")

        if self.max_value is not None and decimal_val > self.max_value:
            msg = self.error_messages.get("max_value") or (
                f"O valor máximo permitido para este campo é {_format_brl_label(self.max_value)}."
            )
            raise forms.ValidationError(msg, code="max_value")

        return decimal_val


class ModalidadeFinanciamentoChoices:
    """Constantes de modalidade aceitas na whitelist do backend."""

    TERRENO_E_CONSTRUCAO = "terreno_construcao"
    TERRENO_PROPRIO = "terreno_proprio"
    CASA_PLANTA = "casa_planta"

    CHOICES: tuple[tuple[str, str], ...] = (
        (TERRENO_E_CONSTRUCAO, "Financiar Terreno + Construção (Caixa)"),
        (TERRENO_PROPRIO, "Já possuo terreno quitado e quero financiar a Construção"),
        (CASA_PLANTA, "Imóvel na planta / orientação inicial"),
    )


class SistemaAmortizacaoChoices:
    """Sistemas oficiais de amortização praticados pela Caixa Econômica Federal."""

    SAC = "SAC"
    PRICE = "PRICE"

    CHOICES: tuple[tuple[str, str], ...] = (
        (SAC, "SAC — Parcelas decrescentes ao longo do prazo"),
        (PRICE, "PRICE — Parcelas iniciais menores e fixas"),
    )


class ObjetivoSimplesChoices:
    """Respostas da pergunta 1 do modo simples e a modalidade equivalente no motor financeiro."""

    PROPRIO = "proprio"
    AINDA_NAO = "ainda_nao"
    COMPRAR = "comprar"

    CHOICES: tuple[tuple[str, str], ...] = (
        (PROPRIO, "Sim, já tenho terreno"),
        (AINDA_NAO, "Ainda não tenho terreno"),
        (COMPRAR, "Quero comprar um terreno e construir"),
    )


class TipoCasaSimplesChoices:
    """Padrões de casa exibidos como cartões no modo simples, com valores de referência do site."""

    ESSENCIAL = "essencial"
    CONFORTO = "conforto"
    PERSONALIZADO = "personalizado"
    VALOR = "valor"

    CHOICES: tuple[tuple[str, str], ...] = (
        (ESSENCIAL, "Padrão Essencial — 64 m²"),
        (CONFORTO, "Família Conforto — 92 m²"),
        (PERSONALIZADO, "Personalizado Caixa — 138 m²"),
        (VALOR, "Já sei o valor da obra"),
    )

    VALORES: dict[str, Decimal] = {
        ESSENCIAL: Decimal("190000.00"),
        CONFORTO: Decimal("220000.00"),
        PERSONALIZADO: Decimal("350000.00"),
    }


class EntradaSimplesChoices:
    """Faixas de entrada do modo simples; usa o valor médio de cada faixa."""

    NENHUMA = "nenhuma"
    ATE_10 = "ate_10"
    DE_10_A_25 = "de_10_a_25"
    DE_25_A_50 = "de_25_a_50"
    ACIMA_50 = "acima_50"
    CUSTOM = "custom"

    CHOICES: tuple[tuple[str, str], ...] = (
        (NENHUMA, "Não tenho dinheiro guardado"),
        (ATE_10, "Até R$ 10 mil"),
        (DE_10_A_25, "R$ 10 a 25 mil"),
        (DE_25_A_50, "R$ 25 a 50 mil"),
        (ACIMA_50, "Mais de R$ 50 mil"),
        (CUSTOM, "Prefiro digitar o valor"),
    )

    VALORES: dict[str, Decimal] = {
        NENHUMA: Decimal("0.00"),
        ATE_10: Decimal("5000.00"),
        DE_10_A_25: Decimal("17500.00"),
        DE_25_A_50: Decimal("37500.00"),
        ACIMA_50: Decimal("75000.00"),
    }


class PrazoSimplesChoices:
    """Formas de pagamento do modo simples traduzidas em prazos válidos do simulador."""

    LONGO = "420"
    EQUILIBRADO = "360"
    RAPIDO = "240"

    CHOICES: tuple[tuple[str, str], ...] = (
        (LONGO, "Parcela menor, mais tempo (420 meses)"),
        (EQUILIBRADO, "Equilibrado (360 meses)"),
        (RAPIDO, "Pagar mais rápido (240 meses)"),
    )


class SimulacaoHabitacionalForm(forms.Form):
    """Valida parâmetros financeiros (`SAC`/`PRICE`) e dados opcionais de atendimento."""

    modalidade = forms.ChoiceField(
        label="Objetivo do financiamento",
        choices=ModalidadeFinanciamentoChoices.CHOICES,
        initial=ModalidadeFinanciamentoChoices.TERRENO_E_CONSTRUCAO,
    )
    renda_familiar = BRLDecimalField(
        label="Renda bruta familiar mensal (R$)",
        min_value=Decimal("1400.00"),
        max_value=Decimal("80000.00"),
        initial="3.500,00",
        max_length=24,
        strip=True,
        help_text="Some a renda bruta de todos os participantes do financiamento.",
        widget=forms.TextInput(
            attrs={
                "placeholder": "R$ 3.500,00",
                "inputmode": "decimal",
                "autocomplete": "off",
                "data-brl-mask": "true",
                "data-slider-min": "1400",
                "data-slider-max": "25000",
                "data-slider-step": "100",
            }
        ),
    )
    valor_obra = BRLDecimalField(
        label="Valor estimado do imóvel / obra (R$)",
        required=False,
        min_value=Decimal("80000.00"),
        max_value=Decimal("1500000.00"),
        default_if_blank=Decimal("220000.00"),
        initial="220.000,00",
        max_length=24,
        strip=True,
        help_text="Inclua terreno + obra ou apenas a construção se já possuir lote.",
        widget=forms.TextInput(
            attrs={
                "placeholder": "R$ 220.000,00",
                "inputmode": "decimal",
                "autocomplete": "off",
                "data-brl-mask": "true",
                "data-slider-min": "80000",
                "data-slider-max": "600000",
                "data-slider-step": "5000",
            }
        ),
    )
    entrada_fgts = BRLDecimalField(
        label="Recursos próprios + saldo FGTS disponível (R$)",
        required=False,
        min_value=Decimal("0.00"),
        max_value=Decimal("1200000.00"),
        default_if_blank=Decimal("0.00"),
        initial="25.000,00",
        max_length=24,
        strip=True,
        help_text="Soma de recursos próprios e FGTS para compor ou abater a entrada.",
        widget=forms.TextInput(
            attrs={
                "placeholder": "R$ 25.000,00",
                "inputmode": "decimal",
                "autocomplete": "off",
                "data-brl-mask": "true",
                "data-slider-min": "0",
                "data-slider-max": "200000",
                "data-slider-step": "2500",
            }
        ),
    )
    prazo_meses = forms.IntegerField(
        label="Prazo desejado (120 a 420 meses)",
        required=False,
        min_value=120,
        max_value=420,
        initial=360,
        help_text="Até 420 meses (35 anos) conforme faixa e idade do proponente.",
        widget=forms.NumberInput(
            attrs={
                "min": "120",
                "max": "420",
                "step": "12",
                "inputmode": "numeric",
                "data-prazo-input": "true",
            }
        ),
    )
    sistema_amortizacao = forms.ChoiceField(
        label="Sistema de amortização",
        required=False,
        choices=SistemaAmortizacaoChoices.CHOICES,
        initial=SistemaAmortizacaoChoices.SAC,
    )
    possui_fgts = forms.ChoiceField(
        label="Trabalha ou trabalhou sob regime FGTS (3+ anos somados)?",
        required=False,
        choices=(
            ("sim", "Sim, elegível à taxa reduzida de cotista FGTS"),
            ("nao", "Não possuo 3 anos de FGTS"),
        ),
        initial="sim",
    )
    possui_dependentes = forms.ChoiceField(
        label="Composição familiar / dependentes",
        required=False,
        choices=(
            ("sim", "Sim, família com cônjuge ou dependentes"),
            ("nao", "Proponente individual sem dependentes"),
        ),
        initial="sim",
    )
    nome = forms.CharField(
        label="Seu nome (opcional para personalizar o resumo)",
        required=False,
        max_length=80,
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "Ex.: Maria Fernandes",
                "autocomplete": "name",
            }
        ),
    )
    telefone = forms.CharField(
        label="WhatsApp com DDD (opcional na simulação)",
        required=False,
        max_length=20,
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "(88) 99999-9999",
                "inputmode": "tel",
                "autocomplete": "tel",
            }
        ),
    )
    cidade_obra = forms.CharField(
        label="Cidade onde deseja construir",
        required=False,
        max_length=80,
        initial="Viçosa do Ceará - CE",
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "Viçosa do Ceará - CE",
            }
        ),
    )

    def clean_prazo_meses(self) -> int:
        """Retorna prazo validado com padrão de 360 meses quando omitido."""
        raw_val = self.cleaned_data.get("prazo_meses")
        if raw_val is None:
            return 360
        return int(raw_val)

    def clean_sistema_amortizacao(self) -> str:
        """Garante sistema de amortização válido (`SAC` por padrão)."""
        raw_val: str = str(self.cleaned_data.get("sistema_amortizacao") or "").strip().upper()
        if raw_val in (SistemaAmortizacaoChoices.SAC, SistemaAmortizacaoChoices.PRICE):
            return raw_val
        return SistemaAmortizacaoChoices.SAC

    def clean_possui_fgts(self) -> str:
        """Padroniza flag de cotista FGTS."""
        raw_val: str = str(self.cleaned_data.get("possui_fgts") or "").strip().lower()
        return "nao" if raw_val == "nao" else "sim"

    def clean_possui_dependentes(self) -> str:
        """Padroniza flag de dependentes."""
        raw_val: str = str(self.cleaned_data.get("possui_dependentes") or "").strip().lower()
        return "nao" if raw_val == "nao" else "sim"

    def clean_nome(self) -> str:
        """Sanitiza o nome quando preenchido; permite vazio na simulação instantânea."""
        raw: str = str(self.cleaned_data.get("nome") or "")
        cleaned: str = sanitize_plain_text(raw, max_length=80)
        if cleaned and len(cleaned) < 3:
            msg = "Informe seu nome com ao menos 3 caracteres ou deixe em branco."
            raise forms.ValidationError(msg)
        return cleaned

    def clean_telefone(self) -> str:
        """Valida telefone brasileiro sempre que informado pelo visitante."""
        raw: str = str(self.cleaned_data.get("telefone") or "").strip()
        if not raw:
            return ""
        return validate_brazilian_phone(raw)

    def clean_cidade_obra(self) -> str:
        """Sanitiza o nome da cidade informada."""
        raw: str = str(self.cleaned_data.get("cidade_obra") or "")
        cleaned: str = sanitize_plain_text(raw, max_length=80)
        return cleaned or "Viçosa do Ceará - CE"


class SimulacaoSimplesForm(forms.Form):
    """Formulário do modo simples: respostas leigas convertidas nos mesmos parâmetros da simulação avançada."""

    objetivo = forms.ChoiceField(
        label="Você já tem um terreno?",
        choices=ObjetivoSimplesChoices.CHOICES,
        error_messages={"required": "Escolha uma opção para continuar."},
    )
    tipo_casa = forms.ChoiceField(
        label="Qual tipo de casa você sonha?",
        choices=TipoCasaSimplesChoices.CHOICES,
        error_messages={"required": "Escolha um tipo de casa para continuar."},
    )
    valor_casa = BRLDecimalField(
        label="Valor estimado da obra (R$)",
        required=False,
        min_value=Decimal("80000.00"),
        max_value=Decimal("1500000.00"),
        max_length=24,
        strip=True,
        error_messages={
            "required": "Digite um valor aproximado para a obra.",
            "invalid": "Digite um valor aproximado (ex.: 220.000).",
            "min_value": "Para simular, informe um valor de obra a partir de R$ 80.000,00.",
            "max_value": "O limite da simulação é R$ 1.500.000,00. Confira o valor da obra.",
        },
        widget=forms.TextInput(
            attrs={
                "placeholder": "R$ 220.000,00",
                "inputmode": "decimal",
                "autocomplete": "off",
                "data-simples-brl": "true",
            }
        ),
    )
    renda_familiar = BRLDecimalField(
        label="Renda mensal da família (R$)",
        min_value=Decimal("1400.00"),
        max_value=Decimal("80000.00"),
        max_length=24,
        strip=True,
        error_messages={
            "required": "Digite um valor aproximado para a renda.",
            "invalid": "Digite um valor aproximado (ex.: 3.500).",
            "min_value": "Informe uma renda de pelo menos R$ 1.400,00 para continuar.",
            "max_value": "Confira a renda: o limite da simulação é R$ 80.000,00 por mês.",
        },
        widget=forms.TextInput(
            attrs={
                "placeholder": "R$ 3.500,00",
                "inputmode": "decimal",
                "autocomplete": "off",
                "data-simples-brl": "true",
            }
        ),
    )
    entrada_faixa = forms.ChoiceField(
        label="Dinheiro guardado ou FGTS para a entrada",
        choices=EntradaSimplesChoices.CHOICES,
        error_messages={"required": "Escolha uma opção para continuar."},
    )
    entrada_valor = BRLDecimalField(
        label="Quanto você tem para a entrada (R$)",
        required=False,
        min_value=Decimal("0.00"),
        max_value=Decimal("1200000.00"),
        max_length=24,
        strip=True,
        error_messages={
            "required": "Digite um valor aproximado para a entrada.",
            "invalid": "Digite um valor aproximado (ex.: 25.000).",
            "max_value": "O valor máximo para a entrada é R$ 1.200.000,00. Confira o valor.",
        },
        widget=forms.TextInput(
            attrs={
                "placeholder": "R$ 25.000,00",
                "inputmode": "decimal",
                "autocomplete": "off",
                "data-simples-brl": "true",
            }
        ),
    )
    prazo = forms.TypedChoiceField(
        label="Como você prefere pagar?",
        choices=PrazoSimplesChoices.CHOICES,
        coerce=int,
        error_messages={"required": "Escolha uma forma de pagamento para continuar."},
    )
    nome = forms.CharField(
        label="Como podemos te chamar?",
        required=False,
        max_length=80,
        strip=True,
        widget=forms.TextInput(
            attrs={"placeholder": "Seu nome", "autocomplete": "name"}
        ),
    )
    telefone = forms.CharField(
        label="Seu WhatsApp (opcional)",
        required=False,
        max_length=20,
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "(88) 99999-9999",
                "inputmode": "tel",
                "autocomplete": "tel",
            }
        ),
    )

    def clean_nome(self) -> str:
        """Sanitiza o nome quando preenchido; permanece opcional."""
        raw: str = str(self.cleaned_data.get("nome") or "")
        cleaned: str = sanitize_plain_text(raw, max_length=80)
        if cleaned and len(cleaned) < 3:
            raise forms.ValidationError("Informe seu nome com ao menos 3 caracteres.")
        return cleaned

    def clean_telefone(self) -> str:
        """Valida o WhatsApp apenas quando informado."""
        raw: str = str(self.cleaned_data.get("telefone") or "").strip()
        if not raw:
            return ""
        try:
            return validate_brazilian_phone(raw)
        except forms.ValidationError as exc:
            raise forms.ValidationError("Confira o WhatsApp: inclua o DDD.") from exc

    def clean(self) -> dict[str, object]:
        """Traduz as respostas do modo simples para os parâmetros financeiros do motor único."""
        cleaned = super().clean()

        tipo = cleaned.get("tipo_casa")
        if tipo == TipoCasaSimplesChoices.VALOR:
            valor_custom = cleaned.get("valor_casa")
            if valor_custom is None and "valor_casa" not in self.errors:
                self.add_error("valor_casa", "Digite um valor aproximado para a obra.")
            elif valor_custom is not None:
                cleaned["valor_obra"] = valor_custom
        elif tipo:
            cleaned["valor_obra"] = TipoCasaSimplesChoices.VALORES[tipo]

        entrada = cleaned.get("entrada_faixa")
        if entrada == EntradaSimplesChoices.CUSTOM:
            entrada_custom = cleaned.get("entrada_valor")
            if entrada_custom is None and "entrada_valor" not in self.errors:
                self.add_error("entrada_valor", "Digite um valor aproximado para a entrada.")
            elif entrada_custom is not None:
                cleaned["entrada_fgts"] = entrada_custom
        elif entrada:
            cleaned["entrada_fgts"] = EntradaSimplesChoices.VALORES[entrada]

        objetivo = cleaned.get("objetivo")
        if objetivo:
            cleaned["modalidade"] = (
                ModalidadeFinanciamentoChoices.TERRENO_PROPRIO
                if objetivo == ObjetivoSimplesChoices.PROPRIO
                else ModalidadeFinanciamentoChoices.TERRENO_E_CONSTRUCAO
            )

        return cleaned


# Alias de retrocompatibilidade para imports existentes em views e suíte de testes
SimulacaoMCMVForm = SimulacaoHabitacionalForm
