"""Formulários validados no backend para filtro de catálogo e pedido de orçamento de locação."""

from django import forms

from apps.locadora.selectors import GRUPOS_CATALOGO, listar_opcoes_equipamentos_choices
from core.validators import sanitize_plain_text, validate_brazilian_phone


class FiltroCatalogoForm(forms.Form):
    """Valida parâmetros `GET` de filtragem do catálogo por whitelist contra injeções."""

    grupo = forms.ChoiceField(
        choices=GRUPOS_CATALOGO,
        required=False,
    )
    q = forms.CharField(
        max_length=60,
        required=False,
        strip=True,
    )

    def clean_grupo(self) -> str:
        """Retorna `'todos'` quando nenhum grupo específico for informado."""
        grupo: str = str(self.cleaned_data.get("grupo") or "todos")
        return grupo

    def clean_q(self) -> str:
        """Sanitiza o termo de busca textual."""
        raw: str = str(self.cleaned_data.get("q") or "")
        return sanitize_plain_text(raw, max_length=60)


class PeriodoLocacaoChoices:
    """Opções de período aceitas no pedido de orçamento."""

    DIARIA = "diaria"
    SEMANAL = "semanal"
    QUINZENAL = "quinzenal"
    MENSAL = "mensal"

    CHOICES: tuple[tuple[str, str], ...] = (
        (DIARIA, "Diárias (1 a 6 dias)"),
        (SEMANAL, "Semanal (7 dias)"),
        (QUINZENAL, "Quinzenal (15 dias — Economia na obra)"),
        (MENSAL, "Mensal (30 dias — Melhor tarifa por dia)"),
    )


class EntregaLocacaoChoices:
    """Modalidades de logística da locadora."""

    ENTREGA_OBRA = "entrega_obra"
    RETIRADA_SEDE = "retirada_sede"

    CHOICES: tuple[tuple[str, str], ...] = (
        (ENTREGA_OBRA, "Receber e retirar direto na obra (Viçosa do Ceará e região)"),
        (RETIRADA_SEDE, "Retirar na sede da Rocha Construtora / Locações"),
    )


class OrcamentoLocacaoForm(forms.Form):
    """Valida solicitação de orçamento multi-equipamento renderizada via Crispy Tailwind."""

    nome = forms.CharField(
        label="Seu nome ou empresa",
        min_length=3,
        max_length=80,
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "Ex.: Construtora / Mestre Carlos",
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
    equipamentos = forms.MultipleChoiceField(
        label="Equipamentos necessários (marque um ou mais)",
        choices=listar_opcoes_equipamentos_choices,
        widget=forms.CheckboxSelectMultiple(),
        error_messages={
            "required": "Selecione ao menos um equipamento para montar seu orçamento.",
        },
    )
    periodo = forms.ChoiceField(
        label="Período estimado de locação",
        choices=PeriodoLocacaoChoices.CHOICES,
        initial=PeriodoLocacaoChoices.SEMANAL,
    )
    modalidade_entrega = forms.ChoiceField(
        label="Entrega na obra ou retirada?",
        choices=EntregaLocacaoChoices.CHOICES,
        initial=EntregaLocacaoChoices.ENTREGA_OBRA,
    )
    observacoes = forms.CharField(
        label="Quantidade / Bairro da obra (opcional)",
        max_length=200,
        required=False,
        strip=True,
        widget=forms.Textarea(
            attrs={
                "rows": 2,
                "placeholder": "Ex.: 12 painéis de andaime + 1 betoneira, obra no bairro Centro.",
            }
        ),
    )

    def clean_nome(self) -> str:
        """Sanitiza e valida comprimento mínimo do nome."""
        cleaned: str = sanitize_plain_text(str(self.cleaned_data["nome"]), max_length=80)
        if len(cleaned) < 3:
            msg = "Informe um nome válido com pelo menos 3 caracteres."
            raise forms.ValidationError(msg)
        return cleaned

    def clean_telefone(self) -> str:
        """Valida telefone brasileiro com DDD."""
        return validate_brazilian_phone(str(self.cleaned_data["telefone"]))

    def clean_observacoes(self) -> str:
        """Sanitiza observações opcionais."""
        raw: str = str(self.cleaned_data.get("observacoes") or "")
        return sanitize_plain_text(raw, max_length=200)
