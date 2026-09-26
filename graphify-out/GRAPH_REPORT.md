# Graph Report - coração presente  (2026-09-14)

## Corpus Check
- 149 files · ~148,775 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 16 file(s) not represented in the graph (top: .css 6, (none) 4, .example 2)

## Summary
- 1011 nodes · 2306 edges · 73 communities (53 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.86)
- Token cost: 276,602 input · 25,608 output

## Community Hubs (Navigation)
- Biblioteca central PHP
- Primitivos de layout e sidebar
- Manifesto de dependencias do front
- Primitivos de formulario e alerta
- Manual de publicacao (KingHost)
- Casca da loja (App.tsx)
- Painel: equipe e financeiro
- Painel: catalogo e constantes
- Backend Node antigo (server.js)
- package.json da raiz
- Painel: pedidos e entregas
- Primitivos de dialogo e botao
- Telas de pagamento semanal
- Niveis de vendedor e utilitarios
- Push e recomendacoes
- Paleta de comandos
- Carrinho e pagamento no cartao
- Disparo de e-mail e push
- Login, PIX e senha
- Primitivo Menubar
- Primitivo Context Menu
- Primitivo Dropdown Menu
- Paginas institucionais e rastreio
- Ligacao de formularios
- Primitivo Carousel
- package.json do backend
- Cartao de compartilhamento (Open Graph)
- Pagina do produto e avaliacoes
- Fechamento semanal de comissao
- Primitivo Select
- Primitivo Drawer
- Grafico da rede de vendas
- Favicon e icone do app
- Primitivo Navigation Menu
- Logo da marca
- Primitivo Sheet
- Primitivo Breadcrumb
- Primitivo Card
- Rastreio Correios (PHP)
- Dependencias do backend Node
- Primitivo OTP Input
- Primitivo Accordion
- Primitivo Popover
- Primitivo Tabs
- E-mails de status (Node antigo)
- Ferramentas de build
- Metadados de peer dependency
- Primitivo Collapsible
- Primitivo Hover Card
- Configuracao do Vite
- Push VAPID (Node antigo)
- Correios (Node antigo)
- API de avaliacoes
- Auth do admin (Node antigo)
- Overrides do pnpm
- Peer dependencies do React
- Scripts do npm
- Tema dos toasts
- Primitivo Aspect Ratio
- Verificacao Google Search Console

## God Nodes (most connected - your core abstractions)
1. `cn()` - 219 edges
2. `react` - 74 edges
3. `lucide-react` - 65 edges
4. `formatarMoeda()` - 53 edges
5. `Produto` - 22 edges
6. `Pedido` - 20 edges
7. `App()` - 17 edges
8. `Cliente` - 14 edges
9. `URL_BACKEND_PIX` - 13 edges
10. `cabecalhosAdmin()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `URL_BACKEND_PIX em src/app/App.tsx` --semantically_similar_to--> `Publicação do front (npm run build → dist → public_html)`  [AMBIGUOUS] [semantically similar]
  backend/README.md → backend-php/README.md
- `Degradação graciosa por configuração ausente` --semantically_similar_to--> `Modo antigo com backend desligado`  [INFERRED] [semantically similar]
  backend-php/README.md → backend/README.md
- `Meta robots index,follow` --semantically_similar_to--> `robots.txt da loja`  [INFERRED] [semantically similar]
  index.html → public/robots.txt
- `Banco MySQL da hospedagem (KingHost)` --semantically_similar_to--> `Banco MySQL coracaopresente`  [INFERRED] [semantically similar]
  backend-php/README.md → backend/README.md
- `Pasta certs/ (cert.pem e key.pem do Pix Sicredi)` --semantically_similar_to--> `PIX Sicredi (backend PHP)`  [INFERRED] [semantically similar]
  backend/certs/COLOQUE_OS_CERTIFICADOS_AQUI.txt → backend-php/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Fluxo de cobrança PIX Sicredi (credenciais, certificado, webhook e reserva estática)** — backend_readme_pix_sicredi, backend_php_readme_pix_sicredi, backend_readme_certificado_pem, backend_certs_coloque_os_certificados_aqui_certificados_pix, backend_php_readme_webhook_pix, backend_php_readme_qr_pix_estatico [INFERRED 0.85]
- **Camada de descoberta na busca (SEO, verificação de propriedade e rastreamento)** — index_seo_meta, index_robots_meta, index_canonical, index_jsonld_onlinestore, index_google_site_verification, public_googlee5a67093bd5fc456_verification_file, public_robots_robots_txt, public_robots_sitemap, index_noscript_fallback [INFERRED 0.85]
- **Avisos de pedido ao cliente (e-mail, Web Push no PWA e rastreamento)** — backend_php_readme_smtp, backend_php_readme_mail_nativo, backend_php_readme_web_push_vapid, backend_php_readme_correios_rastreamento, index_pwa_manifest [INFERRED 0.85]
- **Coracao Presente Brand Identity System** — public_favicon_heart_gift_mark, public_favicon_wordmark_coracao, public_favicon_script_presente, public_favicon_red_gold_cream_palette, public_favicon_brand_logo [EXTRACTED 1.00]
- **Gift-Inside-Heart Pun Composition** — public_favicon_gift_box_glyph, public_favicon_ribbon_bow, public_favicon_heart_gift_mark, public_favicon_gift_as_affection_concept [INFERRED 0.85]
- **Vertical Logo Lockup Composition** — public_logo_brand_mark, public_logo_heart_gift_icon, public_logo_wordmark_coracao, public_logo_script_presente [EXTRACTED 1.00]
- **Dual Pictorial-Verbal Encoding of the Brand Name** — public_logo_heart_gift_icon, public_logo_wordmark_coracao, public_logo_script_presente, public_logo_gift_shop_identity [INFERRED 0.85]
- **Warm Premium Surface Treatment** — public_logo_palette, public_logo_baked_background, public_logo_heart_gift_icon, public_logo_script_presente [INFERRED 0.75]
- **Pre-Click Value Proposition Stack** — public_og_image_hero_claim, public_og_image_delivery_promise, public_og_image_free_shipping_threshold, public_og_image_domain_callout [INFERRED 0.85]
- **Brand Identity System (Mark, Lockup, Palette, Type)** — public_og_image_gift_heart_mark, public_og_image_brand_lockup, public_og_image_palette, public_og_image_typographic_hierarchy [INFERRED 0.85]
- **Crawler-Safe Static Composition** — public_og_image_social_share_preview, public_og_image_canvas_1200x630, public_og_image_split_layout, public_og_image_card [INFERRED 0.85]

## Communities (73 total, 7 thin omitted)

### Community 0 - "Biblioteca central PHP"
Cohesion: 0.06
Nodes (61): autenticacao_opcional(), caminho_cache_vitrine(), criar_codigo_2fa_admin(), criar_codigo_2fa_cliente(), criar_sessao_admin(), criar_sessao_cliente(), criar_tabelas(), criar_token_reset_senha() (+53 more)

### Community 1 - "Primitivos de layout e sidebar"
Cohesion: 0.07
Nodes (53): @radix-ui/react-avatar, @radix-ui/react-tooltip, Avatar(), AvatarFallback(), AvatarImage(), Input(), Separator(), SheetContent() (+45 more)

### Community 2 - "Manifesto de dependencias do front"
Cohesion: 0.04
Nodes (56): dependencies, canvas-confetti, class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react, @emotion/react (+48 more)

### Community 3 - "Primitivos de formulario e alerta"
Cohesion: 0.06
Nodes (32): class-variance-authority, @radix-ui/react-checkbox, @radix-ui/react-progress, @radix-ui/react-radio-group, @radix-ui/react-scroll-area, @radix-ui/react-slider, @radix-ui/react-slot, @radix-ui/react-switch (+24 more)

### Community 4 - "Manual de publicacao (KingHost)"
Cohesion: 0.07
Nodes (47): Pasta certs/ (cert.pem e key.pem do Pix Sicredi), Avaliações de produto (comentário + vídeo), Backend PHP na KingHost, Banco MySQL da hospedagem (KingHost), Cargos da equipe (vendedor / master), Coleções de dados (GET/PUT /api/dados), api/config.php (credenciais centralizadas), Rastreamento Correios (+39 more)

### Community 5 - "Casca da loja (App.tsx)"
Cohesion: 0.08
Nodes (28): sonner, App(), definirSessao(), AvisoBancoDesconectado(), BannerRotativo(), BarraFiltros(), FaixaPreco, Ordenacao (+20 more)

### Community 6 - "Painel: equipe e financeiro"
Cohesion: 0.14
Nodes (25): PaginaConfigAdmin(), PaginaCuponsAdmin(), PaginaDashboard(), PaginaEstoqueAdmin(), PaginaFinanceiroAdmin(), PaginaMasterPlusAdmin(), PaginaMastersAdmin(), PaginaMeusVendedores() (+17 more)

### Community 7 - "Painel: catalogo e constantes"
Cohesion: 0.10
Nodes (27): FormularioBanner(), PaginaBannersAdmin(), FormularioProduto(), PaginaProdutosAdmin(), ATRASO_POPUP_RECOMENDACAO, CATEGORIA_CAIXA, CATEGORIA_CAIXA_LEGADO, CATEGORIAS (+19 more)

### Community 8 - "Backend Node antigo (server.js)"
Cohesion: 0.08
Nodes (11): app, cacheToken, emailAutenticado(), exigirEmailAutenticado(), ORIGENS_PERMITIDAS, pagosPeloWebhook, senhaClienteConfere(), validarArquivoBase64() (+3 more)

### Community 9 - "package.json da raiz"
Cohesion: 0.07
Nodes (28): name, private, type, version, canvas-confetti, clsx, date-fns, @emotion/react (+20 more)

### Community 10 - "Painel: pedidos e entregas"
Cohesion: 0.20
Nodes (14): PaginaEntregadoresAdmin(), linkDaRota(), linkDoMapa(), PaginaEntregas(), ImagemProduto(), ModalDetalhesPedido(), ProdutoDoPedido(), SeloStatus() (+6 more)

### Community 11 - "Primitivos de dialogo e botao"
Cohesion: 0.09
Nodes (19): @radix-ui/react-alert-dialog, AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay() (+11 more)

### Community 12 - "Telas de pagamento semanal"
Cohesion: 0.16
Nodes (18): AvaliacaoAdmin, PaginaAvaliacoesAdmin(), Cargo, dataBr(), diaMes(), FechamentoSemana, PaginaMeusPagamentos(), partesDaComissao (+10 more)

### Community 13 - "Niveis de vendedor e utilitarios"
Cohesion: 0.14
Nodes (17): PaginaSupervisaoAdmin(), PainelAdmin(), CartaoNivelVendedor(), NIVEIS_VENDEDOR, PREFIXOS_CATEGORIA, PaginaMontarCaixa(), capacidadeDaCaixa(), codigoVendaDe() (+9 more)

### Community 14 - "Push e recomendacoes"
Cohesion: 0.21
Nodes (21): cabecalhosAuth, NOTIFICACAO_POR_STATUS, ativarNotificacoes(), base64urlParaBytes(), chavePublica(), desativarNotificacoes(), jaInscrito(), permissaoAtual() (+13 more)

### Community 15 - "Paleta de comandos"
Cohesion: 0.11
Nodes (15): cmdk, Command(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator(), CommandShortcut() (+7 more)

### Community 16 - "Carrinho e pagamento no cartao"
Cohesion: 0.17
Nodes (16): PaginaPedidosAdmin(), numeroCartaoValido(), validadeCartaoValida(), validarDadosCartao(), CampoCodigoVenda(), PopupRecomendacao(), MAX_PARCELAS_CARTAO, PaginaCarrinho() (+8 more)

### Community 17 - "Disparo de e-mail e push"
Cohesion: 0.25
Nodes (18): avisar_cliente_recomendacao(), avisar_cliente_status(), base64url(), cutucar_push(), der_para_jose(), enviar_email_confirmacao_compra(), enviar_email_status(), enviar_push() (+10 more)

### Community 18 - "Login, PIX e senha"
Cohesion: 0.19
Nodes (11): lucide-react, CabecalhoLoja(), IndicadorForcaSenha(), REQUISITOS, Logo(), GOOGLE_CLIENT_ID, NOME_ADMIN, VALIDADE_PIX_MS (+3 more)

### Community 19 - "Primitivo Menubar"
Cohesion: 0.11
Nodes (12): @radix-ui/react-menubar, Menubar(), MenubarCheckboxItem(), MenubarContent(), MenubarItem(), MenubarLabel(), MenubarRadioItem(), MenubarSeparator() (+4 more)

### Community 20 - "Primitivo Context Menu"
Cohesion: 0.12
Nodes (10): @radix-ui/react-context-menu, ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut() (+2 more)

### Community 21 - "Primitivo Dropdown Menu"
Cohesion: 0.12
Nodes (10): @radix-ui/react-dropdown-menu, DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut() (+2 more)

### Community 22 - "Paginas institucionais e rastreio"
Cohesion: 0.12
Nodes (10): CANAIS, dataHoraEvento(), DESCRICAO_ETAPA, ETAPAS, EventoRastreio, PAGINAS, PedidoRastreado, PERGUNTAS (+2 more)

### Community 23 - "Ligacao de formularios"
Cohesion: 0.17
Nodes (13): @radix-ui/react-label, react-hook-form, FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext (+5 more)

### Community 24 - "Primitivo Carousel"
Cohesion: 0.17
Nodes (14): embla-carousel-react, Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext() (+6 more)

### Community 25 - "package.json do backend"
Cohesion: 0.15
Nodes (12): description, name, private, scripts, start, type, version, axios (+4 more)

### Community 26 - "Cartao de compartilhamento (Open Graph)"
Cohesion: 0.28
Nodes (13): Audience: Brazilian Gift Buyers Receiving a Shared Link, Coracao Presente Brand Lockup, 1200x630 Preview Canvas, Open Graph Share Card (Coracao Presente), Nationwide Delivery Promise (Entrega para todo o Brasil), Printed Domain coracaopresente.com.br, Free Shipping Above R$ 299, Heart-Enclosing-Gift Logo Mark (+5 more)

### Community 27 - "Pagina do produto e avaliacoes"
Cohesion: 0.23
Nodes (10): CartaoProduto(), SecaoMaisVendidos(), CORES_SELO, LIMITE_VIDEO_AVALIACAO_MB, LIMITE_VIDEO_AVALIACAO_SEGUNDOS, PaginaProduto(), Avaliacao, categoriaExibida() (+2 more)

### Community 28 - "Fechamento semanal de comissao"
Cohesion: 0.45
Nodes (11): calcular_comissao(), cargo_de(), domingo_da_semana(), equipe_de(), fechar_semanas_vencidas(), fracao_comissao(), percentual_equipe_do_master(), PDO (+3 more)

### Community 29 - "Primitivo Select"
Cohesion: 0.17
Nodes (8): @radix-ui/react-select, SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger()

### Community 30 - "Primitivo Drawer"
Cohesion: 0.17
Nodes (7): vaul, DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 31 - "Grafico da rede de vendas"
Cohesion: 0.27
Nodes (10): CartaoNo(), contarPessoas(), ESTILO_PAPEL, GraficoRede(), ICONE_PAPEL, NoRede, ROTULO_PAPEL, somarComissao() (+2 more)

### Community 32 - "Favicon e icone do app"
Cohesion: 0.25
Nodes (11): Small Accent Heart, Favicon / PWA App Icon Role, Coracao Presente Brand Logo, Gift-as-Affection Brand Concept, Gift Box Glyph, Heart-and-Gift Line Mark, Red / Gold / Cream Brand Palette, Ribbon Bow Loop (+3 more)

### Community 33 - "Primitivo Navigation Menu"
Cohesion: 0.20
Nodes (10): @radix-ui/react-navigation-menu, NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger() (+2 more)

### Community 34 - "Logo da marca"
Cohesion: 0.46
Nodes (8): Square App Icon / Favicon Source Asset, Non-Transparent Baked-In Background, Coracao Presente Brand Mark, Romantic Gifting Store Identity, Heart-and-Gift-Box Emblem, Red, Gold and Blush Palette, 'presente' Gold Script Line, 'coracao' Serif Wordmark

### Community 35 - "Primitivo Sheet"
Cohesion: 0.25
Nodes (4): @radix-ui/react-dialog, Sheet(), SheetFooter(), SheetOverlay()

### Community 36 - "Primitivo Breadcrumb"
Cohesion: 0.25
Nodes (6): BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator()

### Community 37 - "Primitivo Card"
Cohesion: 0.25
Nodes (7): Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader(), CardTitle()

### Community 38 - "Rastreio Correios (PHP)"
Cohesion: 0.57
Nodes (6): correios_arquivo_token(), correios_base(), correios_codigo_valido(), correios_configurado(), correios_eventos(), correios_token()

### Community 39 - "Dependencias do backend Node"
Cohesion: 0.33
Nodes (6): dependencies, axios, cors, dotenv, express, mysql2

### Community 40 - "Primitivo OTP Input"
Cohesion: 0.33
Nodes (4): input-otp, InputOTP(), InputOTPGroup(), InputOTPSlot()

### Community 41 - "Primitivo Accordion"
Cohesion: 0.33
Nodes (4): @radix-ui/react-accordion, AccordionContent(), AccordionItem(), AccordionTrigger()

### Community 43 - "Primitivo Tabs"
Cohesion: 0.33
Nodes (5): @radix-ui/react-tabs, Tabs(), TabsContent(), TabsList(), TabsTrigger()

### Community 44 - "E-mails de status (Node antigo)"
Cohesion: 0.40
Nodes (5): avisarClienteStatus(), enviarEmailDev(), formatarMoedaBrl(), montarLinhaItemDev(), textoAvisoStatus()

### Community 45 - "Ferramentas de build"
Cohesion: 0.40
Nodes (5): devDependencies, tailwindcss, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 46 - "Metadados de peer dependency"
Cohesion: 0.40
Nodes (5): peerDependenciesMeta, react, react-dom, optional, optional

### Community 49 - "Configuracao do Vite"
Cohesion: 0.40
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 50 - "Push VAPID (Node antigo)"
Cohesion: 0.83
Nodes (4): base64url(), carregarVapid(), enviarPush(), tokenVapid()

### Community 51 - "Correios (Node antigo)"
Cohesion: 0.50
Nodes (4): codigoRastreioValido(), correiosConfigurado(), eventosCorreios(), obterTokenCorreios()

### Community 54 - "Auth do admin (Node antigo)"
Cohesion: 0.67
Nodes (3): ipCliente(), registrarAuditoria(), verificarSenhaAdmin()

### Community 55 - "Overrides do pnpm"
Cohesion: 0.67
Nodes (3): vite, pnpm, overrides

### Community 56 - "Peer dependencies do React"
Cohesion: 0.67
Nodes (3): peerDependencies, react, react-dom

### Community 57 - "Scripts do npm"
Cohesion: 0.67
Nodes (3): scripts, build, dev

## Ambiguous Edges - Review These
- `Publicação do front (npm run build → dist → public_html)` → `URL_BACKEND_PIX em src/app/App.tsx`  [AMBIGUOUS]
  backend/README.md · relation: semantically_similar_to
- `Rastreamento Correios` → `Rotas do backend Node`  [AMBIGUOUS]
  backend-php/README.md · relation: conceptually_related_to
- `Avaliações de produto (comentário + vídeo)` → `Rotas do backend Node`  [AMBIGUOUS]
  backend-php/README.md · relation: conceptually_related_to
- `Red, Gold and Blush Palette` → `Non-Transparent Baked-In Background`  [AMBIGUOUS]
  public/logo.png · relation: conceptually_related_to
- `Square App Icon / Favicon Source Asset` → `Non-Transparent Baked-In Background`  [AMBIGUOUS]
  public/logo.png · relation: conceptually_related_to
- `Free Shipping Above R$ 299` → `Social Share Preview Role (og:image / twitter:image)`  [AMBIGUOUS]
  public/og-image.png · relation: conceptually_related_to

## Knowledge Gaps
- **142 isolated node(s):** `name`, `private`, `version`, `type`, `description` (+137 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 260 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Publicação do front (npm run build → dist → public_html)` and `URL_BACKEND_PIX em src/app/App.tsx`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Rastreamento Correios` and `Rotas do backend Node`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Avaliações de produto (comentário + vídeo)` and `Rotas do backend Node`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Red, Gold and Blush Palette` and `Non-Transparent Baked-In Background`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Square App Icon / Favicon Source Asset` and `Non-Transparent Baked-In Background`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Free Shipping Above R$ 299` and `Social Share Preview Role (og:image / twitter:image)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `react` connect `Primitivos de formulario e alerta` to `Primitivos de layout e sidebar`, `Casca da loja (App.tsx)`, `Painel: equipe e financeiro`, `Painel: catalogo e constantes`, `package.json da raiz`, `Painel: pedidos e entregas`, `Primitivos de dialogo e botao`, `Telas de pagamento semanal`, `Push e recomendacoes`, `Paleta de comandos`, `Carrinho e pagamento no cartao`, `Login, PIX e senha`, `Primitivo Menubar`, `Primitivo Context Menu`, `Primitivo Dropdown Menu`, `Paginas institucionais e rastreio`, `Ligacao de formularios`, `Primitivo Carousel`, `Pagina do produto e avaliacoes`, `Primitivo Select`, `Primitivo Drawer`, `Grafico da rede de vendas`, `Primitivo Navigation Menu`, `Primitivo Sheet`, `Primitivo Breadcrumb`, `Primitivo Card`, `Primitivo OTP Input`, `Primitivo Accordion`, `Primitivo Popover`, `Primitivo Tabs`, `Primitivo Hover Card`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._