"""Resumo em PDF da simulação habitacional (modo simples) da Rocha Construtora.

O PDF é gerado 100% no backend com ReportLab e entregue por um token assinado,
evitando recalcular o financiamento no navegador e mantendo o usuário livre de
cadastro. O token carrega apenas textos já formatados e expira em 1 dia.
"""

from __future__ import annotations

import io
from datetime import date, datetime
from typing import Any

from django.conf import settings
from django.core import signing
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

SALT_TOKEN = "rocha.construtora.simulacao.pdf"  # noqa: S105 - sal de assinatura
TOKEN_MAX_AGE_SEGUNDOS = 60 * 60 * 24  # 1 dia

AZUL_ROCHA = colors.HexColor("#1F3354")
DOURADO_ROCHA = colors.HexColor("#C9A45C")
CINZA_SUAVE = colors.HexColor("#F4F1EA")
CINZA_TEXTO = colors.HexColor("#4A5568")

CAMPOS_TEXTO: tuple[str, ...] = (
    "nome",
    "data",
    "faixa",
    "modalidade",
    "renda",
    "valor_obra",
    "entrada",
    "subsidio",
    "financiado",
    "prazo",
    "ltv",
    "entrada_minima",
    "primeira_sac",
    "ultima_sac",
    "primeira_price",
    "ultima_price",
    "total_pago_sac",
    "total_pago_price",
    "comprometimento_sac",
    "comprometimento_price",
    "orientacao",
    "whatsapp",
)


def _data_texto(data: date | datetime | str | None) -> str:
    """Formata datas em `dd/mm/aaaa`, aceitando ISO (`aaaa-mm-dd`) e com fallback para hoje."""
    if isinstance(data, datetime):
        return data.strftime("%d/%m/%Y")
    if isinstance(data, date):
        return data.strftime("%d/%m/%Y")
    texto = str(data or "").strip()
    if not texto:
        return timezone.localdate().strftime("%d/%m/%Y")
    for formato in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(texto, formato).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return texto


def _sanitizar_payload(dados: dict[str, Any]) -> dict[str, str]:
    """Mantém apenas campos conhecidos e converte tudo em texto curto."""
    saneado: dict[str, str] = {}
    for campo in CAMPOS_TEXTO:
        valor = dados.get(campo, "")
        saneado[campo] = str(valor or "").strip()[:400]
    saneado["data"] = _data_texto(saneado.get("data"))
    return saneado


def gerar_token_simulacao(dados: dict[str, Any]) -> str:
    """Cria o token assinado com os textos exibidos no PDF."""
    return signing.dumps(_sanitizar_payload(dados), salt=SALT_TOKEN, compress=True)


def ler_token_simulacao(token: str) -> dict[str, str]:
    """Valida e devolve os dados assinados da simulação."""
    dados = signing.loads(token, salt=SALT_TOKEN, max_age=TOKEN_MAX_AGE_SEGUNDOS)
    if not isinstance(dados, dict):
        msg = "Token da simulação inválido."
        raise signing.BadSignature(msg)
    return _sanitizar_payload(dados)


def _estilos() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle(
            "TituloRocha",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=AZUL_ROCHA,
            alignment=TA_LEFT,
            spaceAfter=2,
        ),
        "subtitulo": ParagraphStyle(
            "SubtituloRocha",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            textColor=CINZA_TEXTO,
            spaceAfter=12,
        ),
        "secao": ParagraphStyle(
            "SecaoRocha",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=AZUL_ROCHA,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "corpo": ParagraphStyle(
            "CorpoRocha",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.8,
            leading=14,
            textColor=CINZA_TEXTO,
        ),
        "aviso": ParagraphStyle(
            "AvisoRocha",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8.6,
            leading=12.5,
            textColor=CINZA_TEXTO,
        ),
    }


def _tabela_dados(linhas: list[tuple[str, str]]) -> Table:
    tabela = Table(
        [[Paragraph(f"<b>{rotulo}</b>", _estilos()["corpo"]), Paragraph(valor, _estilos()["corpo"])]
         for rotulo, valor in linhas],
        colWidths=[58 * mm, 105 * mm],
    )
    tabela.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#E3DDD1")),
            ]
        )
    )
    return tabela


def _tabela_comparativa(dados: dict[str, str]) -> Table:
    cabecalho = ["Sistema", "1ª parcela", "Última parcela", "Total estimado"]
    linhas = [
        cabecalho,
        [
            "SAC (decrescente)",
            dados.get("primeira_sac", ""),
            dados.get("ultima_sac", ""),
            dados.get("total_pago_sac", ""),
        ],
        [
            "PRICE (fixa)",
            dados.get("primeira_price", ""),
            dados.get("ultima_price", ""),
            dados.get("total_pago_price", ""),
        ],
    ]
    tabela = Table(linhas, colWidths=[42 * mm, 38 * mm, 40 * mm, 43 * mm])
    tabela.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), AZUL_ROCHA),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.6),
                ("LEADING", (0, 0), (-1, -1), 11),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CINZA_SUAVE]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E3DDD1")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return tabela


def gerar_pdf_simulacao(dados: dict[str, Any]) -> bytes:
    """Monta o PDF de resumo da simulação e devolve os bytes."""
    dados = _sanitizar_payload(dados)
    estilos = _estilos()
    buffer = io.BytesIO()
    documento = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        title="Simulação Habitacional - Rocha Construtora",
        author="Rocha Construtora",
        subject="Resumo orientativo de financiamento habitacional Caixa",
    )

    historia: list[Any] = [
        Paragraph("Rocha Construtora", estilos["titulo"]),
        Paragraph(
            "Resumo da simulação habitacional Caixa &middot; "
            f"{dados.get('data', '')}",
            estilos["subtitulo"],
        ),
        Paragraph(
            f"Preparado para <b>{dados.get('nome') or 'Visitante'}</b>",
            estilos["corpo"],
        ),
        Spacer(1, 8),
    ]

    historia.append(Paragraph("Cenário simulado", estilos["secao"]))
    historia.append(
        _tabela_dados(
            [
                ("Perfil", dados.get("faixa", "")),
                ("Modalidade", dados.get("modalidade", "")),
                ("Renda familiar", dados.get("renda", "")),
                ("Valor da obra", dados.get("valor_obra", "")),
                ("Entrada / FGTS informado", dados.get("entrada", "")),
                ("Subsídio estimado", dados.get("subsidio", "")),
                ("Crédito financiado", dados.get("financiado", "")),
                ("Prazo", dados.get("prazo", "")),
                ("Teto de financiamento (LTV)", dados.get("ltv", "")),
                ("Entrada mínima necessária", dados.get("entrada_minima", "")),
            ]
        )
    )

    historia.append(Paragraph("Comparativo SAC x PRICE", estilos["secao"]))
    historia.append(_tabela_comparativa(dados))
    historia.append(Spacer(1, 6))
    historia.append(
        Paragraph(
            f"Comprometimento da renda: SAC {dados.get('comprometimento_sac', '')} "
            f"&middot; PRICE {dados.get('comprometimento_price', '')} "
            "(limite orientativo de 30% da renda).",
            estilos["corpo"],
        )
    )

    historia.append(Paragraph("Leitura da engenharia", estilos["secao"]))
    historia.append(Paragraph(dados.get("orientacao", ""), estilos["corpo"]))

    historia.append(Paragraph("Próximos passos", estilos["secao"]))
    historia.append(
        Paragraph(
            "1. Validar a documentação e o FGTS com nossa equipe.<br/>"
            "2. Confirmar o projeto e a planta com a engenharia Rocha.<br/>"
            "3. Enviar a proposta para análise de crédito da Caixa.",
            estilos["corpo"],
        )
    )
    historia.append(Spacer(1, 10))
    historia.append(
        KeepTogether(
            [
                Table(
                    [
                        [
                            Paragraph(
                                "<b>Aviso importante:</b> esta simulação é orientativa, baseada "
                                "nas regras vigentes do programa habitacional e nas taxas "
                                "informadas. Valores finais, subsídio e aprovação dependem da "
                                "análise de crédito e da avaliação da Caixa Econômica Federal.",
                                estilos["aviso"],
                            )
                        ]
                    ],
                    colWidths=[163 * mm],
                    style=TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), CINZA_SUAVE),
                            ("BOX", (0, 0), (-1, -1), 0.5, DOURADO_ROCHA),
                            ("LEFTPADDING", (0, 0), (-1, -1), 10),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                            ("TOPPADDING", (0, 0), (-1, -1), 9),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                        ]
                    ),
                ),
                Spacer(1, 8),
                Paragraph(
                    f"Fale com a Rocha: {dados.get('whatsapp', '')}",
                    estilos["corpo"],
                ),
            ]
        )
    )

    def _rodape(pdf_canvas: Any, doc: Any) -> None:
        pdf_canvas.saveState()
        largura, _ = A4
        pdf_canvas.setStrokeColor(DOURADO_ROCHA)
        pdf_canvas.setLineWidth(0.8)
        pdf_canvas.line(22 * mm, 14 * mm, largura - 22 * mm, 14 * mm)
        pdf_canvas.setFont("Helvetica", 8)
        pdf_canvas.setFillColor(CINZA_TEXTO)
        pdf_canvas.drawString(22 * mm, 10 * mm, "Rocha Construtora - Viçosa do Ceará/CE")
        pdf_canvas.drawRightString(
            largura - 22 * mm, 10 * mm, f"Página {doc.page}"
        )
        pdf_canvas.restoreState()

    documento.build(historia, onFirstPage=_rodape, onLaterPages=_rodape)
    return buffer.getvalue()
