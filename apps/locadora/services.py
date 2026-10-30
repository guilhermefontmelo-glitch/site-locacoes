"""Camada de Serviços (Service Layer) da Rocha Locações: formatação segura de orçamentos."""

from dataclasses import dataclass

from django.conf import settings

from apps.locadora.forms import EntregaLocacaoChoices, PeriodoLocacaoChoices
from apps.locadora.selectors import listar_opcoes_equipamentos_choices
from core.security import build_whatsapp_url


@dataclass(frozen=True, slots=True)
class ResumoOrcamentoLocacao:
    """Resultado validado pronto para confirmação na UI e envio ao WhatsApp."""

    nome_cliente: str
    itens_nomes: tuple[str, ...]
    periodo_label: str
    entrega_label: str
    observacoes: str
    whatsapp_url: str


def gerar_resumo_orcamento_locacao(
    *,
    nome: str,
    telefone: str,
    equipamentos_slugs: list[str],
    periodo: str,
    modalidade_entrega: str,
    observacoes: str = "",
) -> ResumoOrcamentoLocacao:
    """Monta o resumo comercial validado e o link seguro para o WhatsApp da Locadora."""
    catalogo_map: dict[str, str] = dict(listar_opcoes_equipamentos_choices())
    nomes_selecionados: tuple[str, ...] = tuple(
        catalogo_map[slug] for slug in equipamentos_slugs if slug in catalogo_map
    )

    periodo_map: dict[str, str] = dict(PeriodoLocacaoChoices.CHOICES)
    entrega_map: dict[str, str] = dict(EntregaLocacaoChoices.CHOICES)

    periodo_label: str = periodo_map.get(periodo, "Semanal (7 dias)")
    entrega_label: str = entrega_map.get(modalidade_entrega, "Entrega na obra")

    lista_texto: str = ", ".join(nomes_selecionados)
    bloco_obs: str = f"\n• Detalhes/Local: {observacoes}" if observacoes else ""

    mensagem_whatsapp: str = (
        f"Olá, Rocha Locações! Solicito orçamento pelo site:\n"
        f"• Cliente: {nome} ({telefone})\n"
        f"• Equipamentos: {lista_texto}\n"
        f"• Período: {periodo_label}\n"
        f"• Logística: {entrega_label}"
        f"{bloco_obs}"
    )

    phone_locadora: str = getattr(settings, "ROCHA_WHATSAPP_LOCADORA", "5588994248183")
    whatsapp_url: str = build_whatsapp_url(
        phone_e164=phone_locadora,
        message=mensagem_whatsapp,
    )

    return ResumoOrcamentoLocacao(
        nome_cliente=nome,
        itens_nomes=nomes_selecionados,
        periodo_label=periodo_label,
        entrega_label=entrega_label,
        observacoes=observacoes,
        whatsapp_url=whatsapp_url,
    )

