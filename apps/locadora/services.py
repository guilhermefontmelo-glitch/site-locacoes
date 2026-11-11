"""Camada de Serviços (Service Layer) da Rocha Locações: formatação segura de orçamentos."""

from dataclasses import dataclass

from django.conf import settings

from apps.locadora.forms import EntregaLocacaoChoices, PeriodoLocacaoChoices
from apps.locadora.precos import (
    dias_do_periodo,
    formatar_brl,
    obter_configuracao,
)
from apps.locadora.selectors import listar_opcoes_equipamentos_choices
from core.security import build_whatsapp_url


@dataclass(frozen=True, slots=True)
class ItemOrcamentoLocacao:
    """Item selecionado com quantidade, preço unitário e subtotal calculados."""

    nome: str
    quantidade: int
    preco_unitario: float | None
    subtotal: float | None
    sob_consulta: bool

    @property
    def subtotal_label(self) -> str:
        """Subtotal formatado em reais ou aviso de consulta."""
        return formatar_brl(self.subtotal)


@dataclass(frozen=True, slots=True)
class ResumoOrcamentoLocacao:
    """Resultado validado pronto para confirmação na UI e envio ao WhatsApp."""

    nome_cliente: str
    itens: tuple[ItemOrcamentoLocacao, ...]
    quantidades: dict[str, int]
    periodo_label: str
    periodo_dias: int
    entrega_label: str
    cidade_obra: str
    bairro_obra: str
    total_estimado: float | None
    total_estimado_label: str
    tem_sob_consulta: bool
    whatsapp_url: str

    @property
    def itens_nomes(self) -> tuple[str, ...]:
        """Mantém compatibilidade com o token/PDF que espera apenas os nomes."""
        return tuple(item.nome for item in self.itens)

    @property
    def local_obra_label(self) -> str:
        """Local da obra no formato pedido pela operação: Bairro, Cidade."""
        return f"{self.bairro_obra}, {self.cidade_obra}"


def gerar_resumo_orcamento_locacao(
    *,
    nome: str,
    telefone: str,
    equipamentos_slugs: list[str],
    periodo: str,
    modalidade_entrega: str,
    cidade_obra: str = "",
    bairro_obra: str = "",
    quantidades: dict[str, int] | None = None,
) -> ResumoOrcamentoLocacao:
    """Monta o resumo comercial validado e o link seguro para o WhatsApp da Locadora."""
    catalogo_map: dict[str, str] = dict(listar_opcoes_equipamentos_choices())
    quantidades = quantidades or {}
    dias: int = dias_do_periodo(periodo)

    itens: list[ItemOrcamentoLocacao] = []
    total_estimado = 0.0
    tem_sob_consulta = False

    for slug in equipamentos_slugs:
        nome_equipamento = catalogo_map.get(slug)
        if nome_equipamento is None:
            continue

        quantidade = max(1, int(quantidades.get(slug, 1) or 1))
        configuracao = obter_configuracao(nome_equipamento)
        if configuracao and configuracao.disponivel is not None:
            quantidade = min(quantidade, max(1, configuracao.disponivel))
        preco_diaria = configuracao.preco_diaria if configuracao else None

        if preco_diaria is None:
            preco_unitario = None
            subtotal = None
            tem_sob_consulta = True
        else:
            preco_unitario = preco_diaria * dias
            subtotal = preco_unitario * quantidade
            total_estimado += subtotal

        itens.append(
            ItemOrcamentoLocacao(
                nome=nome_equipamento,
                quantidade=quantidade,
                preco_unitario=preco_unitario,
                subtotal=subtotal,
                sob_consulta=preco_diaria is None,
            )
        )

    periodo_map: dict[str, str] = dict(PeriodoLocacaoChoices.CHOICES)
    entrega_map: dict[str, str] = dict(EntregaLocacaoChoices.CHOICES)

    periodo_label: str = periodo_map.get(periodo, "Semanal (7 dias)")
    entrega_label: str = entrega_map.get(modalidade_entrega, "Entrega na obra")

    total_final: float | None = total_estimado if any(not i.sob_consulta for i in itens) else None
    total_label: str = formatar_brl(total_final)

    lista_texto: str = ", ".join(
        f"{item.quantidade}x {item.nome}" for item in itens
    )
    itens_sob_consulta: tuple[str, ...] = tuple(
        item.nome for item in itens if item.sob_consulta
    )
    bloco_sob_consulta: str = (
        f"\n• Sob consulta: {', '.join(itens_sob_consulta)}"
        if itens_sob_consulta
        else ""
    )
    bloco_total: str = (
        f"\n• Total estimado: {total_label}" if total_final is not None else ""
    )
    local_obra: str = f"{bairro_obra.strip()}, {cidade_obra.strip()}".strip(", ")
    bloco_obra: str = f"\n• Local da obra: {local_obra}" if local_obra else ""

    mensagem_whatsapp: str = (
        f"Olá, Rocha Locações! Solicito orçamento pelo site:\n"
        f"• Cliente: {nome} ({telefone})\n"
        f"• Equipamentos: {lista_texto}\n"
        f"• Período: {periodo_label} ({dias} diária(s))"
        f"{bloco_total}"
        f"{bloco_sob_consulta}"
        f"\n• Logística: {entrega_label}"
        f"{bloco_obra}"
    )

    phone_locadora: str = getattr(settings, "ROCHA_WHATSAPP_LOCADORA", "5588994248183")
    whatsapp_url: str = build_whatsapp_url(
        phone_e164=phone_locadora,
        message=mensagem_whatsapp,
    )

    return ResumoOrcamentoLocacao(
        nome_cliente=nome,
        itens=tuple(itens),
        quantidades=dict(quantidades),
        periodo_label=periodo_label,
        periodo_dias=dias,
        entrega_label=entrega_label,
        cidade_obra=cidade_obra,
        bairro_obra=bairro_obra,
        total_estimado=total_final,
        total_estimado_label=total_label,
        tem_sob_consulta=tem_sob_consulta,
        whatsapp_url=whatsapp_url,
    )
