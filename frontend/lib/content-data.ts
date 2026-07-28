/**
 * 可编辑内容数据模块（中央内容仓库）
 * ------------------------------------------------------------------
 * 站点的所有静态文案、图片与公司信息统一在此以常量形式集中管理。
 * 编辑人员可直接修改此处文案、产品描述、FAQ、公司详情，
 * 而无需改动各个页面组件。
 */

/**
 * 站点全局使用的公司信息（meta 标签、页脚、关于页面、联系页面）。
 * 所有字段通过 `as const` 深度只读，防止意外修改。
 */
export const COMPANY = {
  /** 在头部和导航中显示的简短品牌名称 */
  name: "Songdian Technology",
  /** 完整的法律实体名称 */
  fullName: "Songdian Technology (Guangdong) Co., Ltd.",
  /** 一句话价值主张 */
  tagline: "Digital Camera OEM/ODM Manufacturer",
  /** SEO meta 描述和简介段落 */
  description:
    "A leading OEM/ODM digital camera manufacturer with 20 years of industry expertise. 30+ new products annually, 10 million units annual output, and 500+ patents — serving global brands across 60+ countries.",
  /** 公司成立年份（集团母公司深圳 Sonida 创立于 2006 年） */
  founded: 2006,
  /** 员工数量 */
  employees: "1,000+",
  /** 工厂面积 */
  factorySize: "40,000 m²",
  /** 最大年产能 */
  annualOutput: "10M+ units/year",
  /** 每年发布的新产品数量 */
  annualProducts: "30+",
  /** 注册专利总数 */
  patents: "500+",
  /** 大致年营收 */
  annualRevenue: "US$100M+",

  /** 联系页面和结构化数据中显示的联系方式 */
  contact: {
    /** 物理地址（英文，便于海外访客阅读） */
    address: "Room 801, Building 17, Tongde Intelligent Manufacturing Park, No. 9 Guizhou Avenue East, Shangjiashi Community, Ronggui Subdistrict, Shunde District, Foshan, Guangdong, China",
    /** 地址纬度（用于地图精准定位，避免文本地址落点偏移） */
    lat: 22.75499,
    /** 地址经度（同德智造园东缘，已按页面拖拽校准至 17 栋一带） */
    lng: 113.28204,
    /** 城市 */
    city: "Foshan",
    /** 国家 */
    country: "China",
    /** 主要业务邮箱 */
    email: "leon@sonida.com",
    /** 备用联系邮箱 */
    emailAlt: "whvpn1208@gmail.com",
    /** 主要电话号码 */
    phone: "+86 18800375068",
    /** WhatsApp 商务号码 */
    whatsapp: "+86 19143890442",
    /** 工作时间描述 */
    hours: "Monday – Friday, 9:00 AM – 6:00 PM (GMT+8)",
  },

  /** 社交媒体和 marketplace 资料 */
  social: {
    /** Facebook 公司主页 */
    facebook: "https://www.facebook.com/people/Songdian-Camera/61580702439375/",
    /** LinkedIn 公司主页 */
    linkedin: "https://linkedin.com/company/songdian-technology",
    /** YouTube 频道（与页脚 SOCIAL_LINKS 保持一致，避免双份维护漂移） */
    youtube: "https://www.youtube.com/@SongDianCam",
    /** 阿里巴巴店铺 */
    alibaba: "https://songdiantech.en.alibaba.com",
  },
} as const;

// ============================================================
// Hero 区域
// ============================================================

/**
 * 首页 Hero 区域内容。
 * 包含徽章、主标题、副标题，以及主/次 CTA 按钮标签与其目标路由。
 */
export const HERO = {
  /** 主标题上方显示的小徽章/标签 */
  badge: "B2B Camera Manufacturing Partner",
  /** 主 Hero 标题（首页的 H1） */
  title: "Your Trusted Digital Camera Manufacturer",
  /** 标题下方的支持性段落 */
  subtitle: "20 years of OEM/ODM expertise. 30+ new products annually, 10 million units annual output, and 500+ patents. Premium digital cameras designed and manufactured for global brands.",
  /** 行动号召按钮配置 */
  cta: {
    /** 主要（高亮）CTA */
    primary: { label: "Explore Products", href: "/products" },
    /** 次要（轮廓样式）CTA */
    secondary: { label: "Get a Quote", href: "/contact" },
  },
} as const;

// ============================================================
// 信任条
// ============================================================

/**
 * Hero 区域下方展示的信任指标条。
 * 每个项目将 Lucide 图标名称与一句简短的可信度声明配对。
 */
export const TRUST_ITEMS = [
  /** ISO 9001 质量管理认证 */
  { icon: "shield", text: "ISO 9001 Certified" },
  /** 日产能 */
  { icon: "lightning", text: "10M Units/Year Capacity" },
  /** 全球市场覆盖 */
  { icon: "globe", text: "60+ Countries Served" },
  /** 专利组合 */
  { icon: "trophy", text: "500+ Patents" },
] as const;

// ============================================================
// 信任条 — 认证标识墙（Certification Wall）
// ============================================================

/**
 * 首页信任条（认证标识墙）展示的资质认证。
 * 选用全球 B2B 买家最熟悉的几项，均对应 ABOUT.certificationImages 中的真实证书图片。
 * code 为证书代号（徽章主显示），full 为全称（用于 tooltip / 无障碍标签）。
 */
export const TRUST_CERTS = [
  { code: "ISO 9001", full: "Quality Management System" },
  { code: "CE", full: "European Conformity" },
  { code: "FCC", full: "U.S. Federal Communications Commission" },
  { code: "RoHS", full: "Restriction of Hazardous Substances" },
  { code: "UL", full: "Underwriters Laboratories" },
  { code: "UKCA", full: "UK Conformity Assessed" },
  { code: "BSCI", full: "Business Social Compliance Initiative" },
  { code: "FDA", full: "U.S. Food & Drug Administration" },
  { code: "TELEC", full: "Japan Radio Equipment Certification" },
  { code: "WEEE", full: "Waste Electrical & Electronic Equipment" },
] as const;

// ============================================================
// 产品分类（显示在首页）
// ============================================================

/**
 * 首页展示的产品分类卡片。
 * 每个分类包含名称、简短描述与对应的 Lucide 图标标识符。
 */
export const PRODUCT_CATEGORIES = [
  /** 微单 / 可换镜头相机 */
  {
    name: "Mirrorless Camera",
    slug: "mirrorless-camera",
    description: "Interchangeable lens cameras with advanced imaging for enthusiasts",
    icon: "aperture",
  },
  /** 卡片机 / 便携相机 */
  {
    name: "Compact Camera",
    slug: "compact-camera",
    description: "4K/48MP compact point-and-shoot cameras with autofocus and flip screens",
    icon: "camera",
  },
  /** 运动相机 */
  {
    name: "Action Camera",
    slug: "action-camera",
    description: "Waterproof 4K action cameras with EIS for outdoor adventures",
    icon: "shield",
  },
  /** 视频相机 / 摄像机 */
  {
    name: "Video Camera",
    slug: "video-camera",
    description: "1080p/4K camcorders and vlogging cameras with stabilization",
    icon: "video",
  },
  /** 儿童相机 */
  {
    name: "Kids Camera",
    slug: "kids-camera",
    description: "Durable, child-friendly instant print and digital cameras",
    icon: "smile",
  },
  /** 镜头 / 配件 */
  {
    name: "Lens",
    slug: "lens",
    description: "Camera lenses and optical accessories",
    icon: "circle",
  },
] as const;

// ============================================================
// 首页 — 产品类目展示（我们有哪些相机类目）
// ============================================================

/**
 * 首页"产品类目"卡片展示配置。
 * 键为产品分类 slug（与 WordPress /products?category=<slug> 筛选、以及下方 categoryOrder 保持一致），
 * 值为该类目在首页卡片上展示的名称与一句话描述。
 * 卡片图片动态取该类目下最新一个产品的特色图，不在此写死。
 */
export const CATEGORY_SHOWCASE: Record<string, { name: string; description: string }> = {
  "mirrorless-camera": {
    name: "Mirrorless Camera",
    description: "Interchangeable-lens systems with advanced imaging for enthusiasts and professionals.",
  },
  "compact-camera": {
    name: "Compact Camera",
    description: "Pocketable 4K point-and-shoot cameras with autofocus and flip screens.",
  },
  "action-camera": {
    name: "Action Camera",
    description: "Waterproof 4K action cameras with EIS for outdoor adventures.",
  },
  "video-camera": {
    name: "Video Camera",
    description: "1080p/4K camcorders and vlogging cameras with built-in stabilization.",
  },
  "kids-camera": {
    name: "Kids Camera",
    description: "Durable, child-friendly instant-print and digital cameras.",
  },
  lens: {
    name: "Lens",
    description: "Camera lenses and optical accessories for mirrorless systems.",
  },
};


// ============================================================
// 全球 ODM 合作伙伴（首页）
// ============================================================

/**
 * 首页"Global ODM Partners"区域内容。
 * 展示全球出口网络（地图+辐射箭头）与国际合作品牌 Logo 墙。
 */
export const GLOBAL_ODM = {
  /** 区块主标题 */
  title: "Global ODM Partners",
  /** 品牌红 eyebrow 标签 */
  eyebrow: "Global Reach",
  /** 核心标语（主标语） */
  tagline: "World-Class Quality, Certified Excellence",
  /** 核心标语（副标语） */
  taglineSecondary: "Proven Partner for Global Imaging Brands",
  /** 出口国家/地区描述 */
  exportDescription:
    "Products exported to 60+ countries/regions including US, Japan, Europe, Australia, Middle East, South Africa, Thailand, Mexico, Indonesia, South America, Russia, and Central Asia.",
  /** ODM 服务合作品牌列表（用于文字展示 + 结构化数据） */
  brands: ["Konica Minolta", "Kenko", "Rollei", "YASHICA", "aiwa", "ILFORD", "B+H", "Gripo", "AKITO"],
} as const;

// ============================================================
// 为什么选择我们（首页）
// ============================================================

/**
 * 首页"为什么选择我们"区域展示的竞争优势亮点。
 * 每个优势包含标题与一段描述文字。
 */
export const STRENGTHS = [
  {
    title: "20 Years of Expertise",
    description: "Since 2006, we've been dedicated to digital camera R&D and manufacturing. Our veteran engineering team delivers products that win markets.",
    icon: "award",
  },
  {
    title: "30+ New Products Annually",
    description: "Fast-paced innovation cycle — we launch over 30 new models each year, keeping your product lineup fresh and competitive.",
    icon: "zap",
  },
  {
    title: "10M Units Annual Output",
    description: "10 production lines across 40,000 m² facility. Annual capacity of 10 million units ensures timely delivery at any scale.",
    icon: "factory",
  },
  {
    title: "500+ Patents",
    description: "Deep investment in R&D with a portfolio of 500+ registered patents covering optical design, electronics, and manufacturing processes.",
    icon: "lightbulb",
  },
  {
    title: "Global B2B Partner",
    description: "Serving brands across North America, Europe, Asia, Middle East, and Oceania. Verified by TÜV Rheinland onsite inspection.",
    icon: "globe",
  },
  {
    title: "End-to-End Service",
    description: "From industrial design and prototyping to mass production, packaging, and logistics — we're your single-source camera manufacturing partner.",
    icon: "package",
  },
] as const;

// ============================================================
// 隐私政策（隐私页 / Privacy Policy）
// ============================================================

/**
 * 首页页脚「Privacy」链接指向 /privacy-policy，本常量为其全部文案。
 * 设计要点：
 *   - 正文各小节存于 `sections`（prose + 可选 bullets）。
 *   - “Contact Us” 小节不写死，由页面用 {@link COMPANY} 动态渲染，
 *     保证公司名称 / 地址 / 邮箱 / 电话与全站始终同步。
 *   - 不写 `as const`：各小节字段（paragraphs / bullets）可选且不齐，
 *     走 TS 推断出的公共结构，避免联合类型访问报错。
 *   - 语言沿用全站英文（B2B 全球客户），如需中文版可在此追加。
 */
export const PRIVACY = {
  /** 最近更新日期 */
  lastUpdated: "July 27, 2026",
  /** 开篇说明（数据控制者 + 适用范围） */
  intro:
    "Songdian Technology (Guangdong) Co., Ltd. (\"Songdian\", \"we\", \"us\") operates this website to present our OEM/ODM digital camera manufacturing services to business customers worldwide. This Privacy Policy explains what personal information we collect, how we use and protect it, and the choices and rights you have. By using this site, you agree to the practices described below.",
  /** 政策正文各小节（联系方式的“Contact Us”小节由 COMPANY 动态渲染，保持与全站同步） */
  sections: [
    {
      id: "controller",
      title: "1. Who We Are (Data Controller)",
      paragraphs: [
        "The data controller responsible for your personal information is Songdian Technology (Guangdong) Co., Ltd., a digital camera manufacturer founded in 2006 and headquartered in Foshan, Guangdong, China. Our registered address and full contact details appear in the “Contact Us” section below.",
      ],
    },
    {
      id: "collect",
      title: "2. Information We Collect",
      paragraphs: [
        "We collect only the information needed to respond to your inquiries and operate the site responsibly:",
      ],
      bullets: [
        "Inquiry & contact forms — your name, company name, business email, optional phone number, and the message you submit.",
        "Subscriptions — your email address if you sign up for product updates or newsletters.",
        "Partner accounts — login credentials and profile details if you are granted access to a customer portal.",
        "Automatically collected data — IP address, browser and device type, and referring pages. Aggregated, non-identifying usage analytics are collected only where you have accepted analytics cookies (see Section 5).",
      ],
    },
    {
      id: "use",
      title: "3. How We Use Your Information",
      bullets: [
        "Respond to your inquiries, quotes, and manufacturing requests.",
        "Provide and improve our OEM/ODM services, products, and website.",
        "Send service communications and, where you have opted in, product news and updates.",
        "Comply with legal obligations and protect our rights, users, and business.",
        "Analyze site usage to improve content and user experience.",
      ],
    },
    {
      id: "legal-basis",
      title: "4. Legal Basis for Processing",
      paragraphs: [
        "Where the General Data Protection Regulation (GDPR) or similar law applies, we process your personal data on the following bases: performance of a contract (e.g., responding to a request for a quote); our legitimate interests in operating and improving our business; and your consent, where you have subscribed to marketing communications. You may withdraw consent at any time without affecting prior processing.",
      ],
    },
    {
      id: "cookies",
      title: "5. Cookies and Similar Technologies",
      paragraphs: [
        "We use cookies and comparable technologies to keep the site functioning, remember preferences, and understand how visitors use it. On your first visit a consent banner lets you choose which categories to allow: strictly necessary cookies are always active, while analytics cookies load only after you accept them. You can change your choice any time via “Cookie Settings” in the footer. You can also control or disable cookies through your browser settings; some features may not work if you do so.",
      ],
      bullets: [
        "Strictly necessary — required for core site functionality and security.",
        "Analytics — help us measure traffic and improve the site (aggregated, non-identifying). Loaded only after you accept them.",
        "Preference — remember choices such as language or region.",
      ],
    },
    {
      id: "sharing",
      title: "6. How We Share Information",
      paragraphs: [
        "We do not sell your personal information. We share it only with:",
      ],
      bullets: [
        "Service providers — vetted partners who help us run the site, deliver email, and provide IT and customer-support services, bound by confidentiality.",
        "Professional advisors and authorities — where required by law, regulation, legal process, or to protect rights and safety.",
        "A successor entity — in connection with a merger, acquisition, or asset transfer, subject to this policy.",
      ],
    },
    {
      id: "transfers",
      title: "7. International Data Transfers",
      paragraphs: [
        "As a global OEM/ODM supplier serving brands in 60+ countries, your information may be transferred to and processed in China and other jurisdictions where we or our service providers operate. Where required, we rely on appropriate safeguards (such as standard contractual clauses) to protect your data.",
      ],
    },
    {
      id: "retention",
      title: "8. Data Retention",
      paragraphs: [
        "We keep personal information only as long as necessary for the purposes described in this policy, to comply with legal obligations, resolve disputes, and enforce agreements. Inquiry records are typically retained for the duration of the business relationship and a limited period thereafter.",
      ],
    },
    {
      id: "security",
      title: "9. Data Security",
      paragraphs: [
        "We maintain technical and organizational measures appropriate to the sensitivity of the data — including access controls, encryption in transit, and network safeguards — to protect your personal information against unauthorized access, loss, or misuse. No method of transmission or storage is completely secure, but we continually review and strengthen our controls.",
      ],
    },
    {
      id: "rights",
      title: "10. Your Privacy Rights",
      paragraphs: [
        "Depending on your location, you may have the right to access, correct, delete, or port your personal data, to restrict or object to certain processing, and to withdraw consent. To exercise any of these rights, contact us using the details below; we will respond within the timeframe required by applicable law.",
      ],
      bullets: [
        "Access — request a copy of the personal data we hold about you.",
        "Rectification — ask us to correct inaccurate or incomplete data.",
        "Erasure — request deletion of your data where there is no overriding reason to keep it.",
        "Objection & restriction — object to, or ask us to pause, certain processing.",
        "Portability — receive your data in a structured, machine-readable format.",
      ],
    },
    {
      id: "children",
      title: "11. Children's Privacy",
      paragraphs: [
        "This website is intended for business customers and professional buyers, not children. We do not knowingly collect personal information from anyone under 16. If you believe a minor has provided us data, contact us and we will delete it.",
      ],
    },
    {
      id: "changes",
      title: "12. Changes to This Policy",
      paragraphs: [
        "We may update this Privacy Policy from time to time. Material changes will be reflected by the “Last updated” date at the top, and where appropriate we will notify you through the site or by email.",
      ],
    },
  ],
};

// ============================================================
// 解决方案（解决方案页 / Solutions）
// ============================================================

/**
 * 解决方案页 Hero 区域文案。
 * 传达「我们是一家位于中国的工厂，专业从事高品质相机研发」，
 * 以及「解决方案根据您的需求量身定制」的核心定位。
 */
export const SOLUTIONS_HERO = {
  /** 品牌红 eyebrow 标签 */
  eyebrow: "Our Solutions",
  /** 主标题（H1） */
  title: "Camera Solutions, Tailored to Your Needs",
  /** 支持性段落 */
  subtitle:
    "We are a China-based factory specializing in the R&D of high-quality cameras. From your spec sheet to your product idea, we offer three core solutions to match how you go to market: OEM, ODM, and SONGDIAN brand distribution.",
} as const;

/**
 * 三大核心解决方案：OEM、ODM、SONGDIAN 品牌经销。
 * 每个解决方案包含锚点 id、标题、简短口号、概述段落、
 * 功能要点列表与 Lucide 图标标识符。
 */
export const SOLUTIONS = [
  {
    /** 用于锚点/哈希链接的唯一标识符 */
    id: "oem",
    /** 解决方案标题 */
    title: "OEM Manufacturing",
    /** 简短口号 */
    tagline: "Build to Your Specification",
    /** Lucide 图标标识符 */
    icon: "factory",
    /** 概述段落 */
    summary:
      "Hand us your product specifications, BOM, and branding — we handle component sourcing, PCB assembly, firmware, QC, and packaging. Ten production lines and 10 million units of annual capacity keep your orders on time, at any scale.",
    /** 主要功能/交付物 */
    features: [
      "Full BOM procurement and supply-chain management",
      "High-precision SMT assembly across 10 production lines",
      "Custom firmware with your splash screen and UI",
      "Custom enclosure with your logo and color scheme",
      "Retail-ready packaging with your brand design",
      "100% functional QC with detailed inspection reports",
    ],
  },
  {
    id: "odm",
    title: "ODM Design & Development",
    tagline: "We Design, You Brand",
    icon: "pencil-ruler",
    summary:
      "Choose from our library of 500+ patented camera designs, or let our R&D team develop a custom product for your market. We launch 30+ new models every year — from concept to mass production in as little as 3 months.",
    features: [
      "Access to 500+ patented camera designs",
      "Industrial design and mechanical engineering (CAD/CAM)",
      "Custom PCB schematic and layout design",
      "Embedded firmware development and ISP tuning",
      "Rapid prototyping with 3D printing and CNC",
      "CE, FCC, RoHS compliance support",
    ],
  },
  {
    id: "distribution",
    title: "SONGDIAN Brand Distribution",
    tagline: "Distribute Our Brand",
    icon: "store",
    summary:
      "Become an authorized distributor of the SONGDIAN brand. Get factory-direct pricing across our full camera catalog, plus marketing and after-sales support — everything you need to sell proven cameras under a trusted name.",
    features: [
      "Factory-direct pricing with competitive distributor margins",
      "Full catalog of proven, market-ready camera models",
      "Marketing assets, product photography, and sales collateral",
      "Brand-backed warranty and dedicated after-sales support",
      "Regional exclusivity options for qualified partners",
    ],
  },
] as const;

// ============================================================
// FAQ 数据
// ============================================================

/**
 * 按分类组织的 FAQ 内容，用于 FAQ 页面展示，
 * 并生成 FAQPage 结构化数据（SEO）。
 * 每个分类下包含一组"问题/答案"对。
 */
export const FAQS = [
  {
    /** 分类标题 */
    category: "Capabilities & Certification",
    items: [
      {
        question: "How do you prove your factory's strength?",
        answer:
          "We have 20 years of experience, an in-house R&D team, and hold certifications like ISO 9001, CE, RoHS, FCC, Sedex. We serve as a long-term manufacturing partner for brands like Minolta, Rollei and Kenko.",
      },
      {
        question: "What is your quality control process?",
        answer:
          "We implement full-process QC (IQC, IPQC, FQC, OQC) with traceable components, ensuring every batch meets EU & USA standards.",
      },
    ],
  },
  {
    category: "Product Quality",
    items: [
      {
        question: "How is product quality consistency ensured?",
        answer:
          "Standardized automated production minimizes errors. We perform batch testing and provide quality reports.",
      },
      {
        question: "What certifications do your products have?",
        answer:
          "UL, CE, RoHS, FDA, MSDS. Specific certificates are provided per product.",
      },
    ],
  },
  {
    category: "Delivery",
    items: [
      {
        question: "What is your lead time? Can you expedite?",
        answer:
          "Standard lead time: 15–35 days after deposit. Samples: 7 days. Rush orders are eligible for expedited production.",
      },
      {
        question: "How reliable is your on-time delivery?",
        answer:
          "We guarantee on-time delivery with regular order progress updates.",
      },
    ],
  },
  {
    category: "After-Sales Service",
    items: [
      {
        question: "What after-sales support do you offer?",
        answer:
          "12-month warranty + professional technical support + free replacement for confirmed defects.",
      },
    ],
  },
  {
    category: "Cooperation",
    items: [
      {
        question: "What is your sample policy?",
        answer:
          "Samples are available. Sample cost + shipping fee can be refunded in formal orders.",
      },
      {
        question: "What are your payment terms?",
        answer:
          "T/T, L/C are accepted. Final terms confirmed in the sales contract.",
      },
    ],
  },
  {
    category: "Customization Services",
    items: [
      {
        question: "Do you offer customization?",
        answer:
          "Yes. We provide full customization including: Software — UI, functions, compliance; Hardware — Specifications, components, design; Branding & Packaging — Logo, retail package; One-stop solution from design to shipment.",
      },
    ],
  },
] as const;

// ============================================================
// 关于页面内容
// ============================================================

/**
 * 关于我们页面的全部内容，涵盖 hero 区域、公司故事、
 * 历史时间线、核心价值观、认证资质与研发亮点。
 */
export const ABOUT = {
  /** 关于页面 hero/横幅区域 */
  hero: {
    title: "About Songdian Technology",
    subtitle:
      "A leading digital camera OEM/ODM manufacturer with 20 years of expertise. 30+ new products annually, 10 million units annual output, and 500+ registered patents.",
  },

  /** 公司起源故事 */
  story: {
    title: "Our Story",
    /** 构成叙述的段落数组 */
    content: [
      "SONGDIAN Technology is a wholly-owned subsidiary of Shenzhen Sonida, established in 2023. Its parent company, Shenzhen Sonida Digital Technology Co., Ltd., was founded in 2006. We are a national high-tech enterprise integrating R&D, design, production, sales, and brand operations.",
      "Specializing in digital imaging equipment, our products cover digital cameras, camcorders, printers, and imaging accessories. We are one of the largest digital camera companies in China.",
      "The group operates two major centers in Shenzhen and Shunde, with a 40,000m² facility and over 1,000 employees. Our annual production capacity exceeds 10 million units, and we hold over 500 national patents.",
      "We are certified by ISO9001, CE, FCC, and Sedex, and have long-term ODM cooperation with global brands including Minolta, Rollei, and Kenko.",
    ],
  },

  /** 关键经营指标（数字滚动展示，嵌入 Our Story 右侧栏） */
  stats: [
    { value: 40000, prefix: "", suffix: " ㎡", label: "Facility Area", format: true },
    { value: 60, prefix: "", suffix: "+", label: "Countries Served", format: false },
    { value: 10, prefix: "", suffix: "M+", label: "Annual Output", format: false },
    { value: 1000, prefix: "", suffix: "+", label: "Employees", format: true },
    { value: 500, prefix: "", suffix: "+", label: "Patents", format: true },
    { value: 100, prefix: "", suffix: "+", label: "R&D Experts", format: true },
  ],

  /** 公司里程碑时间线 */
  timeline: [
    {
      year: "2006",
      title: "Company Established",
      event: "Shenzhen Sonida Digital Technology Co., Ltd. was established, beginning involvement in the digital imaging field.",
    },
    {
      year: "2009",
      title: "First Independently Developed Camcorder",
      event: "First independently developed camcorder DV801 launched, marking the start of independent camera product R&D.",
    },
    {
      year: "2023",
      title: "SONGDIAN Company Established",
      event: "Subsidiary SONGDIAN Technology (Guangdong) Co., Ltd. established. Member of the Brand Powerhouse in Electronic Digital Industry. Launched brand upgrade strategy.",
    },
    {
      year: "2024",
      title: "Disney Authorized",
      event: "Obtained Disney authorization, launching SONGDIAN Disney series. Won Best Outdoor Marketing Case at 9th China Advertising Festival.",
    },
    {
      year: "2025",
      title: "China Top 500 Brands",
      event: "Selected as Top 10 China Camera Brand, honored on China's Top 500 Brands list. Recognized as Outstanding China Compact Camera of 2025.",
    },
  ],

  /** 核心价值观 */
  values: [
    {
      title: "Craftsmanship",
      description:
        "We treat every component and every process with meticulous attention to detail. Our engineering team brings 20 years of camera-specific manufacturing expertise to every project.",
    },
    {
      title: "Innovation Driven",
      description:
        "With 500+ registered patents and 30+ new products launched annually, innovation is in our DNA. We invest heavily in R&D to stay ahead of market trends.",
    },
    {
      title: "B2B Partnership",
      description:
        "We succeed when our clients succeed. Our flexible OEM/ODM model adapts to your needs — whether you need a small branding run or full custom product development.",
    },
    {
      title: "Quality Without Compromise",
      description:
        "TÜV Rheinland onsite-verified manufacturer. Every camera undergoes rigorous multi-stage QC testing before it leaves our factory.",
    },
  ],

  /** 资质认证证书图片（图标格栅 + 点击 Lightbox 展示高清大图）
   * 图片统一存放于 public/CertificationsAndComplianceImages/，文件名前缀即证书类型。
   * title 为证书代号，description 为证书全称/适用范围，src 指向 public 下的图片。 */
  certificationImages: [
    { title: "BSCI", description: "Business Social Compliance Initiative", src: "/CertificationsAndComplianceImages/BSCI-sonida.png" },
    { title: "CE", description: "European Conformity", src: "/CertificationsAndComplianceImages/CE-DC312-songdian.png" },
    { title: "CPC", description: "Children's Product Certificate", src: "/CertificationsAndComplianceImages/CPC-DC50X-sonida.png" },
    { title: "EMC", description: "Electromagnetic Compatibility", src: "/CertificationsAndComplianceImages/EMC-sonida.png" },
    { title: "EPA", description: "U.S. Environmental Protection Agency", src: "/CertificationsAndComplianceImages/EPA-sonida.png" },
    { title: "FCC", description: "U.S. Federal Communications Commission", src: "/CertificationsAndComplianceImages/FCC-DC312-songdian.png" },
    { title: "FDA", description: "U.S. Food & Drug Administration", src: "/CertificationsAndComplianceImages/FDA-sonida.png" },
    { title: "ISO 9001", description: "Quality Management System", src: "/CertificationsAndComplianceImages/ISO9001-songdian.png" },
    { title: "MSDS", description: "Material Safety Data Sheet", src: "/CertificationsAndComplianceImages/MSDS-sonida.png" },
    { title: "RoHS", description: "Restriction of Hazardous Substances", src: "/CertificationsAndComplianceImages/RoHS-DC312-songdain.png" },
    { title: "TELEC", description: "Japan Radio Equipment Certification", src: "/CertificationsAndComplianceImages/TELEC-sonida.png" },
    { title: "UKCA", description: "UK Conformity Assessed", src: "/CertificationsAndComplianceImages/UKCA-DC312-songdian.png" },
    { title: "UL", description: "Underwriters Laboratories", src: "/CertificationsAndComplianceImages/UL-HDV301-sonida.png" },
    { title: "UN38.3", description: "Battery Transport Safety", src: "/CertificationsAndComplianceImages/UN38.3-NP60-sonida.png" },
    { title: "WEEE", description: "Waste Electrical & Electronic Equipment", src: "/CertificationsAndComplianceImages/WEEE-sonida.png" },
  ],

  /** 研发区域内容 */
  rd: {
    title: "Research & Development",
    content:
      "Our R&D center is the engine behind 30+ new products each year. With 500+ registered patents spanning optical design, electronic engineering, firmware development, and manufacturing processes, we have the technical depth to tackle any camera development challenge — from entry-level point-and-shoot cameras to advanced 4K mirrorless systems.",
    /** 以统计卡片形式显示的关键研发指标 */
    highlights: [
      { label: "Annual New Products", value: "30+" },
      { label: "Registered Patents", value: "500+" },
      { label: "Production Lines", value: "10" },
      { label: "Annual Output", value: "10M Units" },
    ],
  },

  /** 制造实力三大板块（并入工厂视频区，作为能力卡片展示）
   * 说明：与现有 Our Story / 右侧数字 / 研发区保持一致口径——
   * 工厂面积采用 40,000㎡、每年新品采用 30+（用户确认以现状为准）；
   * 净新增事实：总投资约 3.5 亿元、线材加工 7+ 年、垂直整合产线。 */
  manufacturing: [
    {
      title: "Mega Factory",
      body: "Our mega factory spans approximately 40,000 m² with a total investment of around 350 million RMB. It integrates product design, R&D, manufacturing, and sales under one roof.",
    },
    {
      title: "Production Capability",
      body: "Leveraging 20 years of manufacturing expertise in 3C digital products and 7+ years in cable processing, we operate a vertically integrated process — in-house R&D, mold development, injection molding, and final assembly — ensuring high efficiency and reliable on-time delivery.",
    },
    {
      title: "Innovation Technology",
      body: "Committed to innovation in digital imaging, we continuously introduce top technical talent and launch 30+ new products annually, with 500+ design patents and product certifications recognized domestically and internationally.",
    },
  ],

  /** 工厂宣传视频区块（About 页，CTA 之前） */
  factory: {
    title: "Take a Look Inside Our Factory",
    caption:
      "Step inside our 40,000 m² manufacturing facility — where over 10 million cameras are precision-built every year.",
  },
} as const;

// ============================================================
// 联系页面文案（Contact）
// ============================================================
// 注：「Send an Inquiry」表单的信任背书条（24h 回复 / 免费报价 / 60+ 国家）
// 与 Lucide 图标组件强耦合，直接定义在 components/form/InquiryForm.tsx 内，
// 不在此集中管理，避免 icon 名称到组件的映射冗余。
