"""Formulários validados estritamente no backend para pré-simulação Caixa / MCMV."""

from decimal import Decimal

from django import forms

from core.validators import sanitize_plain_text, validate_brazilian_phone


class ModalidadeFinanciamentoChoices:
    """Constantes de modalidade aceitas na whitelist do backend."""

    TERRENO_E_CONSTRUCAO = "terreno_construcao"
    TERRENO_PROPRIO = "terreno_proprio"
    CASA_PLANTA = "casa_planta"

    CHOICES: tuple[tuple[str, str], ...] = (
        (TERRENO_E_CONSTRUCAO, "Financiar Terreno + Construção (Caixa)"),
        (TERRENO_PROPRIO, "Já possuo terreno e quero financiar a Construção"),
        (CASA_PLANTA, "Imóvel na planta / orientação inicial"),
    )


class SimulacaoMCMVForm(forms.Form):
    """Valida os dados da pré-análise habitacional Minha Casa Minha Vida / Caixa."""

    nome = forms.CharField(
        label="Seu nome",
        min_length=3,
        max_length=80,
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "Ex.: João Mendes",
                "autocomplete": "name",
            }
        ),
    )
    telefone = forms.CharField(
        label="WhatsApp com DDD",
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
    renda_familiar = forms.DecimalField(
        label="Renda bruta familiar mensal (R$)",
        min_value=Decimal("1400.00"),
        max_value=Decimal("60000.00"),
        max_digits=9,
        decimal_places=2,
        localize=False,
        help_text="Some a renda de todos que vão compor o financiamento (ex: 3200.00).",
        widget=forms.NumberInput(
            attrs={
                "placeholder": "3200.00",
                "step": "100.00",
                "min": "1400",
                "max": "60000",
            }
        ),
    )
    modalidade = forms.ChoiceField(
        label="Qual é o seu objetivo?",
        choices=ModalidadeFinanciamentoChoices.CHOICES,
    )
    possui_fgts = forms.ChoiceField(
        label="Possui saldo de FGTS (3+ anos de carteira somados)?",
        choices=(
            ("sim", "Sim, desejo usar FGTS para abater entrada/obra"),
            ("nao", "Não possuo ou prefiro simular sem FGTS"),
        ),
    )
    cidade_obra = forms.CharField(
        label="Cidade onde deseja construir",
        max_length=80,
        initial="Viçosa do Ceará - CE",
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "Viçosa do Ceará - CE",
            }
        ),
    )

    def clean_nome(self) -> str:
        """Sanitiza o nome removendo caracteres de controle."""
        raw: str = str(self.cleaned_data["nome"])
        cleaned: str = sanitize_plain_text(raw, max_length=80)
        if len(cleaned) < 3:
            msg = "Informe seu nome com ao menos 3 caracteres."
            raise forms.ValidationError(msg)
        return cleaned

    def clean_telefone(self) -> str:
        """Valida e padroniza telefone brasileiro (DDD + número)."""
        raw: str = str(self.cleaned_data["telefone"])
        return validate_brazilian_phone(raw)

    def clean_cidade_obra(self) -> str:
        """Sanitiza o nome da cidade informada."""
        raw: str = str(self.cleaned_data["cidade_obra"])
        cleaned: str = sanitize_plain_text(raw, max_length=80)
        return cleaned or "Viçosa do Ceará - CE"

