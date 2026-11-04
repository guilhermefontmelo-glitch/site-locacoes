"""Tabela de preços da Rocha Locações usada na Caderneta de Contas em PDF.

Preencha os valores abaixo com o preço de locação de cada equipamento em cada
período. Enquanto o valor estiver em ``0``, a caderneta imprime "A combinar"
nas colunas Vlr. Unt. e Total.

As chaves dos equipamentos são exatamente os nomes exibidos no catálogo
(``apps/locadora/selectors.py``), para que o formulário e a caderneta falem a
mesma língua.
"""

PRECOS: dict[str, dict[str, float]] = {
    "Andaimes Tubulares": {
        "diaria": 0.0,
        "semanal": 0.0,
        "quinzenal": 0.0,
        "mensal": 0.0,
    },
    "Escoras Metálicas": {
        "diaria": 0.0,
        "semanal": 0.0,
        "quinzenal": 0.0,
        "mensal": 0.0,
    },
    "Betoneira Profissional 400L": {
        "diaria": 0.0,
        "semanal": 0.0,
        "quinzenal": 0.0,
        "mensal": 0.0,
    },
    "Vibrador de Concreto": {
        "diaria": 0.0,
        "semanal": 0.0,
        "quinzenal": 0.0,
        "mensal": 0.0,
    },
    "Guincho Elétrico de Coluna": {
        "diaria": 0.0,
        "semanal": 0.0,
        "quinzenal": 0.0,
        "mensal": 0.0,
    },
    "Martelete Perfurador / Rompedor": {
        "diaria": 0.0,
        "semanal": 0.0,
        "quinzenal": 0.0,
        "mensal": 0.0,
    },
    "Esmerilhadeira Angular": {
        "diaria": 0.0,
        "semanal": 0.0,
        "quinzenal": 0.0,
        "mensal": 0.0,
    },
    "Serra Circular Profissional": {
        "diaria": 0.0,
        "semanal": 0.0,
        "quinzenal": 0.0,
        "mensal": 0.0,
    },
}
