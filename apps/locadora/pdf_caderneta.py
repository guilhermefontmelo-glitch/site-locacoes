"""Geração da Caderneta de Contas em PDF da Rocha Locações.

O PDF final usa a própria folha da caderneta como fundo (página de índice 1 do
arquivo ``static/pdf/Caderneta_de_Contas.pdf``) e recebe o texto por cima, com
o overlay desenhado pelo ReportLab e mesclado pelo pypdf.

Todas as medidas abaixo foram tiradas de uma renderização de 924 x 1314 px e
são convertidas para o tamanho real da página (em pontos) na hora de desenhar.
"""

from __future__ import annotations

import io
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core import signing
from django.utils import timezone
from pypdf import PageObject, PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from apps.locadora.forms import PeriodoLocacaoChoices
from apps.locadora.precos import preco_periodo
from core.validators import sanitize_plain_text

# Se True, o PDF final começa com a capa e termina com a contracapa do modelo.
INCLUIR_CAPA = False

MODELO_PDF = Path(settings.BASE_DIR) / "static" / "pdf" / "Caderneta_de_Contas.pdf"
PAGINA_MODELO = 1  # índice da folha de tabela em branco (0 = capa)

SALT_TOKEN = "rocha.locadora.caderneta.pdf"  # noqa: S105 - sal de assinatura, não é senha
TOKEN_MAX_AGE_SEGUNDOS = 60 * 60 * 24  # 1 dia

DataPedido = date | datetime | str | None

COR_TEXTO = HexColor("#1F3354")
FONTE = "Helvetica"
FONTE_NEGRITO = "Helvetica-Bold"
FONTE_ITALICO = "Helvetica-Oblique"

# Medidas de referência (px) da renderização 924 x 1314.
LARGURA_REF = 924.0
ALTURA_REF = 1314.0

OBRA_X0, OBRA_X1 = 203.0, 553.0
OBRA_Y0, OBRA_Y1 = 137.0, 193.0

# Centros (px) dos três claros de ``___/___/_____`` impressos no modelo. Desenhar
# apenas os números mantém as barras originais visíveis e evita sobreposição.
DATA_TOPO_CENTROS_PX = (618.4, 701.6, 813.6)
DATA_TOPO_BASE = 182.0
DATA_TOPO_TAMANHO = 17.0

TABELA_TOPO = 273.0
TABELA_ALTURA = 59.6
TABELA_LINHAS = 16

COL_DATA_X0, COL_DATA_X1 = 34.0, 147.0
COL_PROD_X0, COL_PROD_X1 = 147.0, 373.0
COL_VALOR_X0, COL_VALOR_X1 = 373.0, 497.0
COL_QTD_X0, COL_QTD_X1 = 497.0, 584.0
COL_TOTAL_X0, COL_TOTAL_X1 = 584.0, 724.0
COL_RECEBEDOR_X0, COL_RECEBEDOR_X1 = 724.0, 890.0

MARGEM_INTERNA = 6.0  # px

_POR_LABEL_PERIODO: dict[str, str] = {
    label: chave for chave, label in PeriodoLocacaoChoices.CHOICES
}


def _chave_periodo(periodo: str) -> str:
    """Aceita tanto a chave (``semanal``) quanto o texto do select."""
    texto = str(periodo or "").strip()
    if texto in _POR_LABEL_PERIODO.values():
        return texto
    if texto in _POR_LABEL_PERIODO:
        return _POR_LABEL_PERIODO[texto]
    baixo = texto.lower()
    if baixo.startswith("di"):
        return PeriodoLocacaoChoices.DIARIA
    if baixo.startswith("quin"):
        return PeriodoLocacaoChoices.QUINZENAL
    if baixo.startswith("men"):
        return PeriodoLocacaoChoices.MENSAL
    return PeriodoLocacaoChoices.SEMANAL


def _label_periodo(periodo: str) -> str:
    chave = _chave_periodo(periodo)
    return dict(PeriodoLocacaoChoices.CHOICES).get(chave, str(periodo))


def _preco_unitario(nome: str, periodo: str) -> float:
    chave = _chave_periodo(periodo)
    return float(preco_periodo(nome, chave))


def _brl(valor: float) -> str:
    texto = f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {texto}"


def _data_texto(data: DataPedido) -> str:
    if isinstance(data, datetime):
        return data.strftime("%d/%m/%Y")
    if isinstance(data, date):
        return data.strftime("%d/%m/%Y")
    texto = str(data or "").strip()
    return texto or timezone.localdate().strftime("%d/%m/%Y")


def _normalizar_itens(itens: list[Any]) -> list[tuple[str, int]]:
    normalizados: list[tuple[str, int]] = []
    for item in itens or []:
        if isinstance(item, dict):
            nome = str(item.get("nome") or item.get("produto") or "").strip()
            quantidade = item.get("qtd") or item.get("quantidade") or 1
        elif isinstance(item, (list, tuple)):
            # O token assinado é serializado em JSON: tuplas voltam como listas.
            nome = str(item[0]).strip() if item else ""
            quantidade = item[1] if len(item) > 1 else 1
        else:
            nome = str(item).strip()
            quantidade = 1
        try:
            qtd = max(1, int(quantidade))
        except (TypeError, ValueError):
            qtd = 1
        if nome:
            normalizados.append((nome, qtd))
    return normalizados


def _montar_linhas(
    itens: list[Any],
    entrega: str,
    periodo: str,
    data_texto: str,
    recebedor: str,
) -> list[dict[str, Any]]:
    linhas: list[dict[str, Any]] = []
    nome_recebedor = sanitize_plain_text(str(recebedor or ""), max_length=80)
    for nome, qtd in _normalizar_itens(itens):
        preco = _preco_unitario(nome, periodo)
        total = preco * qtd
        linhas.append(
            {
                "tipo": "item",
                "data": data_texto,
                "produto": nome,
                "valor": _brl(preco) if preco > 0 else "A combinar",
                "qtd": str(qtd),
                "total": _brl(total) if preco > 0 else "A combinar",
                "recebedor": nome_recebedor,
            }
        )
    linhas.append({"tipo": "info", "texto": f"Período: {_label_periodo(periodo)}"})
    linhas.append({"tipo": "info", "texto": f"Entrega: {entrega or 'Não informada'!s}"})
    return linhas


def _quebrar_texto(
    texto: str,
    fonte: str,
    tamanho_max: float,
    tamanho_min: float,
    largura_pt: float,
    max_linhas: int,
) -> tuple[list[str], float]:
    """Ajusta o texto ao espaço disponível, reduzindo a fonte se necessário."""
    tamanho = tamanho_max
    while tamanho >= tamanho_min:
        linhas = simpleSplit(texto, fonte, tamanho, largura_pt)
        if len(linhas) <= max_linhas:
            return linhas, tamanho
        tamanho -= 0.5

    linhas = simpleSplit(texto, fonte, tamanho_min, largura_pt)
    if len(linhas) > max_linhas:
        linhas = linhas[:max_linhas]
        ultima = linhas[-1]
        while ultima and simpleSplit(f"{ultima}…", fonte, tamanho_min, largura_pt) != [
            f"{ultima}…"
        ]:
            ultima = ultima[:-1].rstrip()
        linhas[-1] = f"{ultima}…" if ultima else "…"
    return linhas, tamanho_min


class _Folha:
    """Converte as coordenadas em px da referência para pontos da página real."""

    def __init__(self, pdf_canvas: canvas.Canvas, pagina: PageObject) -> None:
        caixa = pagina.cropbox
        self.c = pdf_canvas
        self.esquerda = float(caixa.left)
        self.base = float(caixa.bottom)
        self.altura = float(caixa.height)
        self.topo = float(caixa.top)
        self.sx = float(caixa.width) / LARGURA_REF
        self.sy = self.altura / ALTURA_REF

    def x(self, valor_px: float) -> float:
        return self.esquerda + valor_px * self.sx

    def y(self, valor_px: float) -> float:
        return self.topo - valor_px * self.sy

    def largura(self, valor_px: float) -> float:
        return valor_px * self.sx

    def escrever_bloco(
        self,
        *,
        texto: str,
        x_px: float,
        largura_px: float,
        centro_y_px: float,
        fonte: str = FONTE,
        tamanho_max: float = 10.0,
        tamanho_min: float = 7.0,
        max_linhas: int = 2,
        alinhamento: str = "left",
    ) -> None:
        largura_pt = self.largura(largura_px)
        linhas, tamanho = _quebrar_texto(
            texto, fonte, tamanho_max, tamanho_min, largura_pt, max_linhas
        )
        if not linhas:
            return
        entrelinha = tamanho * 1.05
        centro_pt = self.y(centro_y_px)
        primeira = centro_pt + ((len(linhas) - 1) * entrelinha) / 2 - tamanho * 0.35
        self.c.setFont(fonte, tamanho)
        for indice, linha in enumerate(linhas):
            linha_y = primeira - indice * entrelinha
            if alinhamento == "center":
                self.c.drawCentredString(self.x(x_px + largura_px / 2), linha_y, linha)
            elif alinhamento == "right":
                self.c.drawRightString(self.x(x_px + largura_px), linha_y, linha)
            else:
                self.c.drawString(self.x(x_px), linha_y, linha)

    def desenhar_obra(self, obra: str) -> None:
        texto = str(obra or "").strip() or "Não informada"
        self.escrever_bloco(
            texto=texto,
            x_px=OBRA_X0 + MARGEM_INTERNA,
            largura_px=(OBRA_X1 - OBRA_X0) - 2 * MARGEM_INTERNA,
            centro_y_px=(OBRA_Y0 + OBRA_Y1) / 2,
            tamanho_max=10.0,
            tamanho_min=7.0,
            max_linhas=2,
        )

    def desenhar_data_topo(self, data_texto: str) -> None:
        """Preenche dia, mês e ano nos claros impressos, preservando as barras."""
        partes = str(data_texto or "").strip().split("/")
        self.c.setFont(FONTE, DATA_TOPO_TAMANHO)
        self.c.setFillColor(COR_TEXTO)

        if len(partes) == 3 and all(partes):
            for centro_px, parte in zip(DATA_TOPO_CENTROS_PX, partes, strict=True):
                self.c.drawCentredString(
                    self.x(centro_px),
                    self.y(DATA_TOPO_BASE),
                    parte,
                )
            return

        centro = (DATA_TOPO_CENTROS_PX[0] + DATA_TOPO_CENTROS_PX[-1]) / 2
        self.c.drawCentredString(self.x(centro), self.y(DATA_TOPO_BASE), data_texto)

    def desenhar_linha(self, indice: int, linha: dict[str, Any]) -> None:
        topo_px = TABELA_TOPO + indice * TABELA_ALTURA
        centro_px = topo_px + TABELA_ALTURA / 2
        centro_pt = self.y(centro_px)
        self.c.setFillColor(COR_TEXTO)

        if linha["tipo"] == "info":
            self.escrever_bloco(
                texto=linha["texto"],
                x_px=COL_PROD_X0 + MARGEM_INTERNA,
                largura_px=(COL_PROD_X1 - COL_PROD_X0) - 2 * MARGEM_INTERNA,
                centro_y_px=centro_px,
                fonte=FONTE_ITALICO,
                tamanho_max=7.6,
                tamanho_min=7.0,
                max_linhas=3,
            )
            return

        tamanho = 10.0
        base = centro_pt - tamanho * 0.35

        self.c.setFont(FONTE, tamanho)
        self.c.drawCentredString(self.x((COL_DATA_X0 + COL_DATA_X1) / 2), base, linha["data"])

        self.escrever_bloco(
            texto=linha["produto"],
            x_px=COL_PROD_X0 + MARGEM_INTERNA,
            largura_px=(COL_PROD_X1 - COL_PROD_X0) - 2 * MARGEM_INTERNA,
            centro_y_px=centro_px,
            tamanho_max=10.0,
            tamanho_min=8.0,
            max_linhas=2,
        )

        self.c.setFont(FONTE, tamanho)
        self.c.drawRightString(self.x(COL_VALOR_X1 - MARGEM_INTERNA), base, linha["valor"])
        self.c.drawCentredString(self.x((COL_QTD_X0 + COL_QTD_X1) / 2), base, linha["qtd"])
        self.c.drawRightString(self.x(COL_TOTAL_X1 - MARGEM_INTERNA), base, linha["total"])

        recebedor = str(linha.get("recebedor") or "").strip()
        if recebedor:
            self.escrever_bloco(
                texto=recebedor,
                x_px=COL_RECEBEDOR_X0 + MARGEM_INTERNA,
                largura_px=(COL_RECEBEDOR_X1 - COL_RECEBEDOR_X0) - 2 * MARGEM_INTERNA,
                centro_y_px=centro_px,
                fonte=FONTE,
                tamanho_max=10.0,
                tamanho_min=6.5,
                max_linhas=2,
            )


def _criar_overlay(
    linhas: list[dict[str, Any]],
    obra: str,
    data_texto: str,
    pagina: PageObject,
) -> bytes:
    largura = float(pagina.mediabox.right)
    altura = float(pagina.mediabox.top)
    buffer = io.BytesIO()
    pdf_canvas = canvas.Canvas(buffer, pagesize=(largura, altura))
    pdf_canvas.setTitle("Caderneta de Contas - Rocha Locações")
    pdf_canvas.setAuthor("Rocha Construtora & Locações")

    folha = _Folha(pdf_canvas, pagina)
    folha.desenhar_obra(obra)
    folha.desenhar_data_topo(data_texto)
    for indice, linha in enumerate(linhas):
        folha.desenhar_linha(indice, linha)

    pdf_canvas.showPage()
    pdf_canvas.save()
    return buffer.getvalue()


def gerar_caderneta(
    itens: list[Any],
    obra: str,
    entrega: str,
    periodo: str,
    data: DataPedido,
    recebedor: str = "",
) -> bytes:
    """Monta a caderneta preenchida e devolve os bytes do PDF final."""
    if not MODELO_PDF.is_file():
        msg = f"Modelo da caderneta não encontrado em {MODELO_PDF}."
        raise FileNotFoundError(msg)

    data_texto = _data_texto(data)
    linhas = _montar_linhas(itens, entrega, periodo, data_texto, recebedor)

    leitor = PdfReader(str(MODELO_PDF))
    pagina_modelo = leitor.pages[PAGINA_MODELO]

    escritor = PdfWriter()
    if INCLUIR_CAPA:
        escritor.add_page(deepcopy(leitor.pages[0]))

    blocos = [
        linhas[inicio : inicio + TABELA_LINHAS] for inicio in range(0, len(linhas), TABELA_LINHAS)
    ] or [[]]

    for bloco in blocos:
        pagina = deepcopy(pagina_modelo)
        overlay = PdfReader(io.BytesIO(_criar_overlay(bloco, obra, data_texto, pagina)))
        pagina.merge_page(overlay.pages[0])
        escritor.add_page(pagina)

    if INCLUIR_CAPA:
        escritor.add_page(deepcopy(leitor.pages[-1]))

    escritor.add_metadata(
        {
            "/Title": "Caderneta de Contas - Rocha Locações",
            "/Author": "Rocha Construtora & Locações",
            "/Subject": "Pedido de orçamento de locação de equipamentos",
        }
    )

    saida = io.BytesIO()
    escritor.write(saida)
    return saida.getvalue()


def gerar_token_caderneta(
    *,
    itens: list[Any],
    obra: str,
    entrega: str,
    periodo: str,
    data: DataPedido,
    recebedor: str = "",
) -> str:
    """Cria um token assinado com os dados do pedido para o download automático."""
    payload = {
        "itens": _normalizar_itens(itens),
        "recebedor": sanitize_plain_text(str(recebedor or ""), max_length=80),
        "obra": str(obra or ""),
        "entrega": str(entrega or ""),
        "periodo": str(periodo or ""),
        "data": _data_texto(data),
    }
    return signing.dumps(payload, salt=SALT_TOKEN, compress=True)


def ler_token_caderneta(token: str) -> dict[str, Any]:
    """Valida e devolve os dados assinados do pedido."""
    dados = signing.loads(token, salt=SALT_TOKEN, max_age=TOKEN_MAX_AGE_SEGUNDOS)
    if not isinstance(dados, dict):
        msg = "Token da caderneta inválido."
        raise signing.BadSignature(msg)
    return dados
