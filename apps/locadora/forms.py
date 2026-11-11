"""Formulários validados no backend para filtro de catálogo e pedido de orçamento de locação."""

from django import forms

from apps.locadora.selectors import (
    GRUPOS_CATALOGO,
    listar_opcoes_equipamentos_choices,
    obter_configuracao_por_slug,
)
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
    cidade_obra = forms.CharField(
        label="Cidade da obra",
        max_length=80,
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "Ex.: Viçosa do Ceará",
                "autocomplete": "address-level2",
            }
        ),
    )
    bairro_obra = forms.CharField(
        label="Bairro da obra",
        max_length=80,
        strip=True,
        widget=forms.TextInput(
            attrs={
                "placeholder": "Ex.: Centro",
                "autocomplete": "address-level3",
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

    def clean_cidade_obra(self) -> str:
        """Sanitiza a cidade da obra informada."""
        raw: str = str(self.cleaned_data.get("cidade_obra") or "")
        cleaned: str = sanitize_plain_text(raw, max_length=80)
        if len(cleaned) < 2:
            msg = "Informe a cidade onde a obra será realizada."
            raise forms.ValidationError(msg)
        return cleaned

    def clean_bairro_obra(self) -> str:
        """Sanitiza o bairro da obra informado."""
        raw: str = str(self.cleaned_data.get("bairro_obra") or "")
        cleaned: str = sanitize_plain_text(raw, max_length=80)
        if len(cleaned) < 2:
            msg = "Informe o bairro onde a obra será realizada."
            raise forms.ValidationError(msg)
        return cleaned

    def clean(self) -> dict[str, object]:
        """Valida as quantidades escolhidas contra a disponibilidade real do catálogo."""
        cleaned = super().clean()
        equipamentos = cleaned.get("equipamentos") or []
        quantidades: dict[str, int] = {}

        for slug in equipamentos:
            configuracao = obter_configuracao_por_slug(str(slug))
            if configuracao is None:
                continue

            bruto = str(self.data.get(f"qtd_{slug}") or "1").strip()
            try:
                quantidade = max(1, int(bruto))
            except (TypeError, ValueError):
                quantidade = 1

            if configuracao.disponivel is not None:
                if configuracao.disponivel <= 1:
                    # Itens com uma única unidade entram sempre com quantidade 1,
                    # mesmo se o seletor não existir no card.
                    quantidade = 1
                elif quantidade > configuracao.disponivel:
                    self.add_error(
                        None,
                        (
                            f"{configuracao.nome}: o máximo disponível é "
                            f"{configuracao.disponivel} unidade(s)."
                        ),
                    )
                    quantidade = configuracao.disponivel

            quantidades[str(slug)] = quantidade

        cleaned["quantidades"] = quantidades
        return cleaned
