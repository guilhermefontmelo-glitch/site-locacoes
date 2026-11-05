"""Fonte única de preços e disponibilidade da Rocha Locações.

O catálogo (``selectors.py``), o formulário, o resumo, o WhatsApp e a Caderneta
em PDF leem daqui. Assim, alterar um preço ou a quantidade disponível em um
único lugar mantém toda a jornada consistente.

Os preços são sempre diários. O valor por período (semanal, quinzenal e mensal)
é calculado multiplicando a diária pela quantidade de dias do período.
"""

from dataclasses import dataclass

PERIODO_DIAS: dict[str, int] = {
    "diaria": 1,
    "semanal": 7,
    "quinzenal": 15,
    "mensal": 30,
}


@dataclass(frozen=True, slots=True)
class ConfiguracaoEquipamento:
    """Preço diário e limite de unidades disponíveis de um equipamento."""

    nome: str
    preco_diaria: float | None
    disponivel: int | None

    @property
    def sob_consulta(self) -> bool:
        """Indica se o equipamento depende de consulta prévia de valor."""
        return self.preco_diaria is None


EQUIPAMENTOS: dict[str, ConfiguracaoEquipamento] = {
    "Andaimes Tubulares Pequenos": ConfiguracaoEquipamento(
        nome="Andaimes Tubulares Pequenos",
        preco_diaria=0.50,
        disponivel=15,
    ),
    "Andaimes Tubulares Grandes": ConfiguracaoEquipamento(
        nome="Andaimes Tubulares Grandes",
        preco_diaria=0.70,
        disponivel=100,
    ),
    "Escoras Metálicas Pequenas": ConfiguracaoEquipamento(
        nome="Escoras Metálicas Pequenas",
        preco_diaria=0.50,
        disponivel=200,
    ),
    "Escoras Metálicas Grandes": ConfiguracaoEquipamento(
        nome="Escoras Metálicas Grandes",
        preco_diaria=0.70,
        disponivel=200,
    ),
    "Betoneira Profissional 400L": ConfiguracaoEquipamento(
        nome="Betoneira Profissional 400L",
        preco_diaria=150.0,
        disponivel=3,
    ),
    "Vibrador de Concreto": ConfiguracaoEquipamento(
        nome="Vibrador de Concreto",
        preco_diaria=None,
        disponivel=None,
    ),
    "Guincho Elétrico de Coluna": ConfiguracaoEquipamento(
        nome="Guincho Elétrico de Coluna",
        preco_diaria=100.0,
        disponivel=1,
    ),
    "Martelete Perfurador / Rompedor": ConfiguracaoEquipamento(
        nome="Martelete Perfurador / Rompedor",
        preco_diaria=100.0,
        disponivel=1,
    ),
    "Esmerilhadeira Angular": ConfiguracaoEquipamento(
        nome="Esmerilhadeira Angular",
        preco_diaria=40.0,
        disponivel=1,
    ),
    "Serra Circular Profissional": ConfiguracaoEquipamento(
        nome="Serra Circular Profissional",
        preco_diaria=40.0,
        disponivel=1,
    ),
}


def obter_configuracao(nome: str) -> ConfiguracaoEquipamento | None:
    """Retorna a configuração comercial do equipamento pelo nome do catálogo."""
    return EQUIPAMENTOS.get(str(nome or "").strip())


def dias_do_periodo(periodo: str) -> int:
    """Converte a chave ou o texto do período na quantidade de diárias cobradas."""
    texto = str(periodo or "").strip().lower()
    if texto in PERIODO_DIAS:
        return PERIODO_DIAS[texto]
    if texto.startswith("di"):
        return PERIODO_DIAS["diaria"]
    if texto.startswith("sem"):
        return PERIODO_DIAS["semanal"]
    if texto.startswith("quin"):
        return PERIODO_DIAS["quinzenal"]
    if texto.startswith("men"):
        return PERIODO_DIAS["mensal"]
    return 1


def preco_periodo(nome: str, periodo: str) -> float:
    """Calcula o valor unitário do equipamento no período informado."""
    configuracao = obter_configuracao(nome)
    if configuracao is None or configuracao.preco_diaria is None:
        return 0.0
    return configuracao.preco_diaria * dias_do_periodo(periodo)


def formatar_brl(valor: float | None) -> str:
    """Formata um valor em reais no padrão brasileiro, ou 'Sob consulta' se nulo."""
    if valor is None:
        return "Sob consulta"
    texto = f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {texto}"


# Compatibilidade com o restante do projeto: tabela por período derivada da
# fonte única acima. Equipamentos "sob consulta" permanecem zerados e o PDF
# imprime "A combinar" nesses casos.
PRECOS: dict[str, dict[str, float]] = {
    nome: {
        chave: (configuracao.preco_diaria or 0.0) * dias
        for chave, dias in PERIODO_DIAS.items()
    }
    for nome, configuracao in EQUIPAMENTOS.items()
}
