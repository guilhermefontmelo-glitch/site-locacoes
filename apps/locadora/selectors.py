"""Seletores tipados e filtragem otimizada do catálogo da Rocha Locações."""

from dataclasses import dataclass

from django.conf import settings
from django.templatetags.static import static

from core.security import build_whatsapp_url


@dataclass(frozen=True, slots=True)
class EquipamentoLocacao:
    """Representa um equipamento revisado disponível para locação em obra."""

    codigo: str
    slug: str
    nome: str
    grupo_slug: str
    grupo_nome: str
    etapa_obra: str
    resumo: str
    especificacoes: tuple[str, ...]
    orientacao_uso: str
    icone: str
    imagem_avif: str
    imagem_webp: str
    imagem_url: str
    whatsapp_url: str


@dataclass(frozen=True, slots=True)
class EtapaComoAlugar:
    """Representa um passo do fluxo simplificado de locação da Rocha."""

    numero: str
    titulo: str
    descricao: str
    tags: str
    icone: str


GRUPOS_CATALOGO: tuple[tuple[str, str], ...] = (
    ("todos", "Todos os Equipamentos"),
    ("estruturas", "Estruturas e Acesso"),
    ("concretagem", "Concretagem"),
    ("elevacao", "Elevação de Carga"),
    ("ferramentas", "Ferramentas Elétricas"),
)

_EQUIPAMENTOS_RAW: tuple[dict[str, object], ...] = (
    {
        "codigo": "01",
        "slug": "andaimes-tubulares",
        "nome": "Andaimes Tubulares",
        "grupo_slug": "estruturas",
        "grupo_nome": "Estruturas e Acesso",
        "etapa_obra": "Alvenaria, Reboco & Fachada",
        "resumo": (
            "Acesso seguro e estável para fachadas, pinturas, reboco e acabamentos em altura."
        ),
        "especificacoes": (
            "Painéis metálicos de encaixe rápido e alta rigidez estrutural (NR-18)",
            "Compatível com plataformas antiderrapantes, guarda-corpo, sapatas e rodízios",
            "Inspecionado lote a lote antes do envio ao canteiro",
        ),
        "orientacao_uso": "Ideal para acelerar reboco externo, chapisco, pintura e instalações.",
        "icone": "building-office-2",
        "imagem_avif": "img/locadora/andaime-tubular.avif",
        "imagem_webp": "img/locadora/andaime-tubular.webp",
        "imagem_url": "img/locacoes/andaime-tubular.jpg",
    },
    {
        "codigo": "02",
        "slug": "escoras-metalicas",
        "nome": "Escoras Metálicas",
        "grupo_slug": "estruturas",
        "grupo_nome": "Estruturas e Acesso",
        "etapa_obra": "Estrutura, Vigas & Laje",
        "resumo": "Sustentação regulável de lajes, vigas e fôrmas durante a concretagem.",
        "especificacoes": (
            "Regulagem milimétrica de altura com rosca e pino de aço",
            "Substitui escoramento de madeira com zero desperdício e prumo perfeito",
            "Alta capacidade de carga axial para lajes treliçadas ou maciças",
        ),
        "orientacao_uso": "Garante nivelamento exato da laje e canteiro limpo e seguro.",
        "icone": "shield-check",
        "imagem_avif": "img/locadora/escora-metalica.avif",
        "imagem_webp": "img/locadora/escora-metalica.webp",
        "imagem_url": "img/locacoes/escora-metalica.jpg",
    },
    {
        "codigo": "03",
        "slug": "betoneira-400l",
        "nome": "Betoneira Profissional 400L",
        "grupo_slug": "concretagem",
        "grupo_nome": "Concretagem",
        "etapa_obra": "Fundação, Estrutura & Alvenaria",
        "resumo": "Mistura homogênea de concreto e argamassa com alta produtividade no canteiro.",
        "especificacoes": (
            "Tambor metálico de 400 litros para traços uniformes sem esforço manual",
            "Motor elétrico revisado com proteção de cremalheira e correia",
            "Reduz desperdício de cimento e acelera concretagens e assentamento",
        ),
        "orientacao_uso": "Indispensável desde o concreto das sapatas até o reboco final.",
        "icone": "cube-transparent",
        "imagem_avif": "img/locadora/betoneira-400l.avif",
        "imagem_webp": "img/locadora/betoneira-400l.webp",
        "imagem_url": "img/locacoes/betoneira.jpg",
    },
    {
        "codigo": "04",
        "slug": "vibrador-de-concreto",
        "nome": "Vibrador de Concreto",
        "grupo_slug": "concretagem",
        "grupo_nome": "Concretagem",
        "etapa_obra": "Fundação & Supraestrutura",
        "resumo": "Adensamento técnico do concreto, eliminando bolhas de ar, falhas e bicheiras.",
        "especificacoes": (
            "Motor portátil acoplado a mangote flexível e agulha de imersão de alta frequência",
            "Aumenta a resistência mecânica e a impermeabilidade da peça concretada",
            "Operação ágil por um único operador na concretagem",
        ),
        "orientacao_uso": "Padrão obrigatório da engenharia Rocha em toda concretagem estrutural.",
        "icone": "sparkles",
        "imagem_avif": "img/locadora/vibrador-concreto.avif",
        "imagem_webp": "img/locadora/vibrador-concreto.webp",
        "imagem_url": "img/locacoes/vibrador-concreto.jpg",
    },
    {
        "codigo": "05",
        "slug": "guincho-eletrico",
        "nome": "Guincho Elétrico de Coluna",
        "grupo_slug": "elevacao",
        "grupo_nome": "Elevação de Carga",
        "etapa_obra": "Obras de 2+ Pavimentos & Cobertura",
        "resumo": "Elevação rápida de baldes de argamassa, blocos e ferramentas entre pavimentos.",
        "especificacoes": (
            "Cabo de aço trançado de alta resistência com freio eletromagnético automático",
            "Botoeira pendente com comando seguro de parada de emergência",
            "Multiplica o ritmo da equipe eliminando transporte manual em escadas",
        ),
        "orientacao_uso": "Ideal para sobrados, lajes superiores e içamento de materiais.",
        "icone": "truck",
        "imagem_avif": "img/locadora/guincho-coluna.avif",
        "imagem_webp": "img/locadora/guincho-coluna.webp",
        "imagem_url": "img/locacoes/guincho-coluna.jpg",
    },
    {
        "codigo": "06",
        "slug": "martelete-rompedor",
        "nome": "Martelete Perfurador / Rompedor",
        "grupo_slug": "ferramentas",
        "grupo_nome": "Ferramentas Elétricas",
        "etapa_obra": "Reformas, Instalações & Demolição",
        "resumo": "Alto impacto para perfuração, abertura de rasgos e demolição em concreto.",
        "especificacoes": (
            "Energia de impacto industrial com empunhadura ergonômica antivibração",
            "Acompanha ponteiro ou talhadeira conforme necessidade do serviço",
            "Pronto para concreto armado, pisos, vigas e alvenaria",
        ),
        "orientacao_uso": "Perfeito para passagens hidráulicas/elétricas, reformas e demolições.",
        "icone": "wrench-screwdriver",
        "imagem_avif": "img/locadora/martelete-rompedor.avif",
        "imagem_webp": "img/locadora/martelete-rompedor.webp",
        "imagem_url": "img/locacoes/martelete-rompedor.jpg",
    },
    {
        "codigo": "07",
        "slug": "esmerilhadeira-profissional",
        "nome": "Esmerilhadeira Angular",
        "grupo_slug": "ferramentas",
        "grupo_nome": "Ferramentas Elétricas",
        "etapa_obra": "Armação de Aço & Serralheria",
        "resumo": "Corte preciso e desbaste de vergalhões de aço, perfis metálicos e alvenaria.",
        "especificacoes": (
            "Coifa de proteção ajustável e trava de eixo para troca segura de disco",
            "Alta rotação constante mesmo sob carga pesada",
            "Revisão elétrica preventiva realizada a cada devolução",
        ),
        "orientacao_uso": "Agilidade no preparo de ferragens estruturais e ajustes finos em obra.",
        "icone": "wrench-screwdriver",
        "imagem_avif": "img/locadora/esmerilhadeira-angular.avif",
        "imagem_webp": "img/locadora/esmerilhadeira-angular.webp",
        "imagem_url": "img/locacoes/esmerilhadeira.jpg",
    },
    {
        "codigo": "08",
        "slug": "serra-circular-madeira",
        "nome": "Serra Circular Profissional",
        "grupo_slug": "ferramentas",
        "grupo_nome": "Ferramentas Elétricas",
        "etapa_obra": "Caixaria de Fôrmas & Madeiramento de Telhado",
        "resumo": "Cortes retos e em ângulo para tábuas de caixaria, pontaletes e telhados.",
        "especificacoes": (
            "Ajuste rápido de profundidade e inclinação de corte até 45°",
            "Guarda retrátil inferior de proteção integral",
            "Precisão de carpintaria para vigas, caibros, ripas e fôrmas",
        ),
        "orientacao_uso": (
            "Essencial na montagem de fôrmas de vigas/pilares e estrutura do telhado."
        ),
        "icone": "wrench-screwdriver",
        "imagem_avif": "img/locadora/serra-circular.avif",
        "imagem_webp": "img/locadora/serra-circular.webp",
        "imagem_url": "img/locacoes/serra-circular.jpg",
    },
)

_ETAPAS_COMO_ALUGAR: tuple[EtapaComoAlugar, ...] = (
    EtapaComoAlugar(
        numero="01",
        titulo="Orçamento Rápido",
        descricao=(
            "Você seleciona os equipamentos, informa a quantidade e o período desejado. "
            "Respondemos na hora pelo WhatsApp com a melhor condição."
        ),
        tags="Selecionar · Cotar · Aprovar",
        icone="calculator",
    ),
    EtapaComoAlugar(
        numero="02",
        titulo="Entrega Revisada na Obra",
        descricao=(
            "O equipamento chega limpo, testado e revisado diretamente no seu canteiro em "
            "Viçosa do Ceará e região, na data combinada."
        ),
        tags="Revisar · Entregar · Orientar",
        icone="truck",
    ),
    EtapaComoAlugar(
        numero="03",
        titulo="Retirada Programada",
        descricao=(
            "Concluiu a etapa da obra? Basta avisar para recolhermos no local ou renovar o "
            "período sem burocracia."
        ),
        tags="Agendar · Retirar · Avançar Obra",
        icone="check-circle",
    ),
)


def _hidratar_equipamento(raw: dict[str, object], phone: str) -> EquipamentoLocacao:
    """Converte registro imutável em `EquipamentoLocacao` com URL WhatsApp sanitizada."""
    nome = str(raw["nome"])
    imagem_avif = str(raw["imagem_avif"])
    imagem_webp = str(raw["imagem_webp"])
    msg = (
        f"Olá! Vim pela área da Rocha Locações no site e gostaria de um orçamento "
        f"para locação de: {nome}."
    )
    especificacoes_raw = raw["especificacoes"]
    especificacoes: tuple[str, ...] = (
        tuple(str(x) for x in especificacoes_raw) if isinstance(especificacoes_raw, tuple) else ()
    )
    return EquipamentoLocacao(
        codigo=str(raw["codigo"]),
        slug=str(raw["slug"]),
        nome=nome,
        grupo_slug=str(raw["grupo_slug"]),
        grupo_nome=str(raw["grupo_nome"]),
        etapa_obra=str(raw["etapa_obra"]),
        resumo=str(raw["resumo"]),
        especificacoes=especificacoes,
        orientacao_uso=str(raw["orientacao_uso"]),
        icone=str(raw["icone"]),
        imagem_avif=imagem_avif,
        imagem_webp=imagem_webp,
        imagem_url=static(imagem_webp),
        whatsapp_url=build_whatsapp_url(phone_e164=phone, message=msg),
    )


def listar_equipamentos(
    *,
    grupo_slug: str = "todos",
    termo_busca: str = "",
) -> list[EquipamentoLocacao]:
    """Filtra os equipamentos por grupo validado e/ou busca textual case-insensitive."""
    phone: str = getattr(settings, "ROCHA_WHATSAPP_LOCADORA", "5588994248183")
    termo_norm: str = termo_busca.strip().lower()

    resultados: list[EquipamentoLocacao] = []
    for raw in _EQUIPAMENTOS_RAW:
        if grupo_slug and grupo_slug != "todos" and raw["grupo_slug"] != grupo_slug:
            continue
        if termo_norm:
            alvo = f"{raw['nome']} {raw['grupo_nome']} {raw['resumo']} {raw['etapa_obra']}".lower()
            if termo_norm not in alvo:
                continue
        resultados.append(_hidratar_equipamento(raw, phone))
    return resultados


def obter_equipamento_por_slug(*, slug: str) -> EquipamentoLocacao | None:
    """Retorna um único equipamento pelo slug ou None caso não exista."""
    phone: str = getattr(settings, "ROCHA_WHATSAPP_LOCADORA", "5588994248183")
    for raw in _EQUIPAMENTOS_RAW:
        if raw["slug"] == slug:
            return _hidratar_equipamento(raw, phone)
    return None


def listar_opcoes_equipamentos_choices() -> list[tuple[str, str]]:
    """Retorna pares `(slug, nome)` para validação whitelist no formulário de orçamento."""
    return [(str(item["slug"]), str(item["nome"])) for item in _EQUIPAMENTOS_RAW]


def listar_como_alugar() -> tuple[EtapaComoAlugar, ...]:
    """Retorna os 3 passos operacionais da Rocha Locações."""
    return _ETAPAS_COMO_ALUGAR
