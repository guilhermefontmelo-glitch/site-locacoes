"""Seletores imutáveis para Etapas 3D da Obra, Jornada Caixa Habitacional e Projetos."""

from dataclasses import dataclass

from django.conf import settings
from django.templatetags.static import static

from core.security import build_whatsapp_url


@dataclass(frozen=True, slots=True)
class EtapaConstrutiva:
    """Representa uma etapa física da obra sincronizada ao palco arquitetônico 3D."""

    ordem: int
    codigo: str
    slug: str
    titulo: str
    subtitulo: str
    resumo: str
    detalhe_engenharia: str
    medicao_caixa: str
    progresso_percentual: int
    icone: str
    camada_3d: str
    imagem_avif: str
    imagem_webp: str


@dataclass(frozen=True, slots=True)
class PassoFinanciamentoCaixa:
    """Representa um passo do processo de financiamento Caixa Habitacional."""

    numero: str
    titulo: str
    descricao: str
    destaque: str
    icone: str


@dataclass(frozen=True, slots=True)
class ProjetoReferencia:
    """Representa uma tipologia residencial financiável pela Rocha Construtora."""

    slug: str
    titulo: str
    modalidade: str
    area_m2: int
    quartos: str
    faixa_indicada: str
    descricao: str
    imagem_avif: str
    imagem_webp: str
    imagem_url: str
    whatsapp_url: str


_ETAPAS_OBRA: tuple[EtapaConstrutiva, ...] = (
    EtapaConstrutiva(
        ordem=1,
        codigo="01",
        slug="terreno-e-projeto",
        titulo="Terreno, Projeto 3D & Aprovação Caixa",
        subtitulo="Planejamento arquitetônico e viabilidade técnica",
        resumo="Escolha do lote ideal, gabarito a laser, planta personalizada e dossiê Caixa.",
        detalhe_engenharia=(
            "Elaboramos o projeto arquitetônico sob medida para sua família, projetos "
            "complementares, planilha orçamentária oficial PFUI da Caixa e registro de ART."
        ),
        medicao_caixa="Análise de engenharia e assinatura do contrato habitacional Caixa.",
        progresso_percentual=15,
        icone="cube-transparent",
        camada_3d="terreno",
        imagem_avif="img/construtora/etapa-01-terreno.avif",
        imagem_webp="img/construtora/etapa-01-terreno.webp",
    ),
    EtapaConstrutiva(
        ordem=2,
        codigo="02",
        slug="fundacao-e-alicerce",
        titulo="Fundação & Impermeabilização",
        subtitulo="Segurança estrutural desde a base do solo",
        resumo="Locação a laser do gabarito, sapatas armadas, vigas baldrame e proteção estanque.",
        detalhe_engenharia=(
            "Executamos escavação dimensionada para o solo da região, armaduras CA-50, concreto "
            "vibrado e impermeabilização asfáltica dupla evitando infiltração ascendente."
        ),
        medicao_caixa="1ª Vistoria de Evolução de Obra — Liberação de recursos validada.",
        progresso_percentual=32,
        icone="shield-check",
        camada_3d="fundacao",
        imagem_avif="img/construtora/etapa-02-fundacao.avif",
        imagem_webp="img/construtora/etapa-02-fundacao.webp",
    ),
    EtapaConstrutiva(
        ordem=3,
        codigo="03",
        slug="estrutura-e-laje",
        titulo="Pilares, Vigas & Concretagem de Laje",
        subtitulo="Esqueleto monolítico dimensionado por engenheiro",
        resumo="Montagem de escoramento metálico, armaduras de aço certificadas e laje nivelada.",
        detalhe_engenharia=(
            "Utilizamos escoras metálicas prumadas, vibradores de imersão para zero bicheiras "
            "no concreto e cura úmida controlada para máxima durabilidade estrutural."
        ),
        medicao_caixa="2ª Vistoria Caixa — Conferência de prumo, nível e supraestrutura.",
        progresso_percentual=52,
        icone="building-office-2",
        camada_3d="estrutura",
        imagem_avif="img/construtora/etapa-03-estrutura.avif",
        imagem_webp="img/construtora/etapa-03-estrutura.webp",
    ),
    EtapaConstrutiva(
        ordem=4,
        codigo="04",
        slug="alvenaria-e-cobertura",
        titulo="Alvenaria, Reboco & Cobertura",
        subtitulo="Conforto térmico, acústico e proteção climática",
        resumo="Elevação de paredes alinhadas, vergas/contravergas e telhado com platibanda.",
        detalhe_engenharia=(
            "Paredes com vergas e contravergas em todos os vãos prevenindo fissuras, "
            "reboco sarrafeado fino e cobertura dimensionada para chuvas intensas na serra."
        ),
        medicao_caixa="3ª Vistoria Caixa — Fechamento da edificação e estanqueidade do telhado.",
        progresso_percentual=72,
        icone="home-modern",
        camada_3d="alvenaria",
        imagem_avif="img/construtora/etapa-04-alvenaria.avif",
        imagem_webp="img/construtora/etapa-04-alvenaria.webp",
    ),
    EtapaConstrutiva(
        ordem=5,
        codigo="05",
        slug="instalacoes-e-acabamento",
        titulo="Instalações & Acabamento Fino",
        subtitulo="Elétrica normatizada, porcelanato e pedras nobres",
        resumo="Circuitos independentes, hidrossanitário testado sob pressão e revestimentos.",
        detalhe_engenharia=(
            "Quadros elétricos com disjuntores DR/DPS (NBR 5410), tubulações testadas antes do "
            "fechamento, assentamento com niveladores a laser, esquadrias e bancadas em granito."
        ),
        medicao_caixa="4ª Vistoria Caixa — Testes funcionais de redes e padrão de acabamento.",
        progresso_percentual=90,
        icone="sparkles",
        camada_3d="instalacoes",
        imagem_avif="img/construtora/etapa-05-instalacoes.avif",
        imagem_webp="img/construtora/etapa-05-instalacoes.webp",
    ),
    EtapaConstrutiva(
        ordem=6,
        codigo="06",
        slug="vistoria-e-entrega-chaves",
        titulo="Vistoria Final & Entrega das Chaves",
        subtitulo="Documentação averbada e garantia construtiva",
        resumo="Pintura premium, limpeza técnica, Habite-se, vistoria final Caixa e chaves na mão.",
        detalhe_engenharia=(
            "Entregamos sua residência 100% pronta para morar, com Habite-se emitido, "
            "averbação encaminhada, Manual do Proprietário e garantia legal de solidez."
        ),
        medicao_caixa="Vistoria Final 100% Concluída — Mudança liberada com total segurança.",
        progresso_percentual=100,
        icone="key",
        camada_3d="entrega",
        imagem_avif="img/construtora/etapa-06-entrega.avif",
        imagem_webp="img/construtora/etapa-06-entrega.webp",
    ),
)

_PASSOS_FINANCIAMENTO: tuple[PassoFinanciamentoCaixa, ...] = (
    PassoFinanciamentoCaixa(
        numero="01",
        titulo="Simulação & Aprovação de Crédito",
        descricao=(
            "Avaliamos gratuitamente sua renda familiar, possibilidade de subsídio do "
            "Minha Casa Minha Vida e uso do saldo do FGTS como entrada."
        ),
        destaque="Sem custo inicial de consulta",
        icone="calculator",
    ),
    PassoFinanciamentoCaixa(
        numero="02",
        titulo="Terreno + Projeto Personalizado",
        descricao=(
            "Ainda não tem lote? A Caixa financia a compra do terreno e a construção da casa "
            "em um único financiamento. Se já possui terreno, financiamos a obra."
        ),
        destaque="Aquisição + Construção Caixa",
        icone="map-pin",
    ),
    PassoFinanciamentoCaixa(
        numero="03",
        titulo="Engenharia & Burocracia Zero",
        descricao=(
            "Nossa equipe técnica cuida de alvará na prefeitura, projetos, cronograma físico-"
            "financeiro PFUI e aprovação junto à engenharia da Caixa Econômica Federal."
        ),
        destaque="Gestão documental ponta a ponta",
        icone="clipboard-document-check",
    ),
    PassoFinanciamentoCaixa(
        numero="04",
        titulo="Obra Auditada por Medição Caixa",
        descricao=(
            "Os recursos são liberados pela Caixa conforme cada etapa da obra avança e é "
            "vistoriada — garantia absoluta de entrega no prazo e no padrão contratado."
        ),
        destaque="Segurança máxima para sua família",
        icone="shield-check",
    ),
    PassoFinanciamentoCaixa(
        numero="05",
        titulo="Chaves na Mão & Patrimônio Valorizado",
        descricao=(
            "Construir financiado gera economia real de até 25% a 30% frente à compra de um "
            "imóvel pronto equivalente, entregando uma casa nova pensada para você."
        ),
        destaque="Patrimônio imediato",
        icone="key",
    ),
)


def listar_etapas_obra() -> tuple[EtapaConstrutiva, ...]:
    """Retorna todas as etapas construtivas ordenadas para o palco 3D e linha do tempo."""
    return _ETAPAS_OBRA


def obter_etapa_por_slug(*, slug: str) -> EtapaConstrutiva | None:
    """Localiza uma etapa construtiva específica pelo slug validado."""
    for etapa in _ETAPAS_OBRA:
        if etapa.slug == slug:
            return etapa
    return None


def obter_etapa_por_ordem(*, ordem: int) -> EtapaConstrutiva | None:
    """Localiza uma etapa construtiva específica pelo número ordinal (`1..6`)."""
    for etapa in _ETAPAS_OBRA:
        if etapa.ordem == ordem:
            return etapa
    return None


def serializar_etapas_obra_payload(*, phone_e164: str) -> list[dict[str, str | int]]:
    """Serializa as 6 etapas para `json_script` (scrubbing em memória sem round-trip HTTP)."""
    payload: list[dict[str, str | int]] = []
    for etapa in _ETAPAS_OBRA:
        whatsapp_url = build_whatsapp_url(
            phone_e164=phone_e164,
            message=(
                f"Olá! Estava vendo a etapa '{etapa.codigo} - {etapa.titulo}' no site da "
                "Rocha Construtora e gostaria de tirar uma dúvida com a engenharia."
            ),
        )
        payload.append(
            {
                "ordem": etapa.ordem,
                "codigo": etapa.codigo,
                "slug": etapa.slug,
                "titulo": etapa.titulo,
                "subtitulo": etapa.subtitulo,
                "resumo": etapa.resumo,
                "detalhe_engenharia": etapa.detalhe_engenharia,
                "medicao_caixa": etapa.medicao_caixa,
                "progresso_percentual": etapa.progresso_percentual,
                "icone": etapa.icone,
                "camada_3d": etapa.camada_3d,
                "imagem_avif_url": static(etapa.imagem_avif),
                "imagem_webp_url": static(etapa.imagem_webp),
                "whatsapp_url": whatsapp_url,
            }
        )
    return payload


def listar_passos_financiamento() -> tuple[PassoFinanciamentoCaixa, ...]:
    """Retorna a sequência explicativa do financiamento Caixa Habitacional."""
    return _PASSOS_FINANCIAMENTO


def listar_projetos_referencia() -> list[ProjetoReferencia]:
    """Retorna modelos residenciais autorais com imagens locais AVIF/WebP e links WhatsApp."""
    phone: str = getattr(settings, "ROCHA_WHATSAPP_CONSTRUTORA", "5588992258807")

    specs: list[dict[str, str | int]] = [
        {
            "slug": "residencial-aurea",
            "titulo": "Residencial Áurea — Minha Casa Minha Vida",
            "modalidade": "Terreno + Construção",
            "area_m2": 64,
            "quartos": "2 Quartos (1 Suíte)",
            "faixa_indicada": "Faixas 1 e 2 · Subsídio + FGTS",
            "descricao": (
                "Planta inteligente com sala integrada, cozinha americana em granito, "
                "área de serviço coberta, garagem e fachada contemporânea com platibanda."
            ),
            "imagem_avif": "img/construtora/projeto-aurea-64m2.avif",
            "imagem_webp": "img/construtora/projeto-aurea-64m2.webp",
        },
        {
            "slug": "residencial-brisa",
            "titulo": "Residencial Brisa — Família Conforto",
            "modalidade": "Terreno + Construção ou Lote Próprio",
            "area_m2": 92,
            "quartos": "3 Quartos (1 Suíte) + Varanda Gourmet",
            "faixa_indicada": "Faixas 2 e 3 · Minha Casa Minha Vida",
            "descricao": (
                "Pé-direito valorizado na sala, suíte espaçosa, acabamento em porcelanato, "
                "iluminação em LED e espaço gourmet integrado ao quintal."
            ),
            "imagem_avif": "img/construtora/projeto-brisa-92m2.avif",
            "imagem_webp": "img/construtora/projeto-brisa-92m2.webp",
        },
        {
            "slug": "residencial-horizonte",
            "titulo": "Residencial Horizonte — Padrão Personalizado Caixa",
            "modalidade": "Construção Sob Medida",
            "area_m2": 138,
            "quartos": "3 Suítes + Garagem Dupla",
            "faixa_indicada": "Minha Casa Minha Vida Faixa 3 / Caixa SBPE",
            "descricao": (
                "Arquitetura autoral de alto padrão construtivo, painel ripado, pedra natural, "
                "infraestrutura para energia solar/climatização e acabamento nobre."
            ),
            "imagem_avif": "img/construtora/projeto-horizonte-138m2.avif",
            "imagem_webp": "img/construtora/projeto-horizonte-138m2.webp",
        },
    ]

    projetos: list[ProjetoReferencia] = []
    for item in specs:
        titulo = str(item["titulo"])
        imagem_avif = str(item["imagem_avif"])
        imagem_webp = str(item["imagem_webp"])
        msg = (
            f"Olá! Vi no site da Rocha Construtora o modelo '{titulo}' "
            f"({item['area_m2']}m²) e gostaria de saber como financiar pela Caixa."
        )
        projetos.append(
            ProjetoReferencia(
                slug=str(item["slug"]),
                titulo=titulo,
                modalidade=str(item["modalidade"]),
                area_m2=int(item["area_m2"]),
                quartos=str(item["quartos"]),
                faixa_indicada=str(item["faixa_indicada"]),
                descricao=str(item["descricao"]),
                imagem_avif=imagem_avif,
                imagem_webp=imagem_webp,
                imagem_url=static(imagem_webp),
                whatsapp_url=build_whatsapp_url(phone_e164=phone, message=msg),
            )
        )
    return projetos
