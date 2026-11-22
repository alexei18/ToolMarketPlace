/*
 * User-facing English copy, quoted from docs/COPY.md (unless a comment names another doc).
 * Keys are stable: other languages will implement the same `Copy` shape.
 * No dependencies, safe for browser bundles (import from "@tm/shared/copy").
 *
 * Where the docs write "Tryworthy", the template takes the site name, so the brand stays in
 * config (SITE_NAME) like the rest of the app.
 */

export const en = {
  home: {
    hero: {
      h1A: "Find the new apps worth trying — before everyone else.",
      h1B: "New apps launch every day. Here are the ones that are actually good.",
      subtitle: "New apps and AI tools, ranked by what real people save and try — with early access and perks you can't get anywhere else.",
      ctaPrimary: "Build my feed — free",
      ctaSecondary: "See what's trending",
      trustLine: "Free forever · Verified makers · Nobody can pay to rank",
    },
    problem: {
      title: "New launches every day. No way to tell which ones are good.",
      text: "Launch boards reward whoever brings the most votes on day one. Social feeds reward whoever shouts loudest. The good stuff gets buried — and you find it months later, after everyone else.",
    },
    howItWorks: {
      /** COPY.md says "any of 20 categories"; `count` is read from the DB (null when unknown). */
      pick: {
        title: "Pick what you're into.",
        text: (count: number | null) => (count ? `Productivity, design, health, dev — any of ${count} categories.` : "Productivity, design, health, dev."),
      },
      rank: { title: "We rank every new launch.", text: "By what real people save, try and comment on. Makers can't pay to move up." },
      first: { title: "You get there first.", text: "A weekly top in your categories, early access to betas, and perks made for you." },
    },
    benefits: {
      firstToKnow: { title: "First to know", text: "New launches reach you before they go viral." },
      rankedByRealPeople: { title: "Ranked by real people", text: "Top this week and Trending, built from saves, tries and feedback — not paid votes." },
      firstToTry: { title: "First to try", text: "Test apps before launch and claim perks makers give only here." },
      realMakers: { title: "Real makers", text: "Every listing comes from a maker who verified their domain." },
    },
    creators: {
      title: "Make content about tools before they trend.",
      text: "Trending shows what's picking up speed this week. Pre-launch betas let you try things nobody has covered yet.",
      cta: "See what's trending",
    },
  },

  /** Variants shown in pre-launch mode (while WAITLIST is on). */
  prelaunch: {
    label: "Launching soon",
    makers: {
      title: "Launching something? Join as a founding maker — your product goes into the launch-day digest.",
      cta: "Submit your product",
    },
    onboardingDone: "You're in. On launch day you'll get this week's top picks in your categories.",
    /** docs/PRELAUNCH.md */
    feedOpensOnLaunchDay: "Your feed opens on launch day",
  },

  /**
   * The waitlist (docs/COPY.md "Waitlist", approved 2026-11-01). Dates arrive formatted
   * ("December 8, 2026") or null while MAKER_ACCESS_DATE / LAUNCH_DATE are not set.
   */
  waitlist: {
    roles: { explorer: "I want to discover apps", maker: "I build apps" },
    roleLine: {
      explorer: "Be first to find the new apps worth trying.",
      maker: "Launch where people actually try new apps. Makers get in a week early.",
    },
    email: "Email",
    emailPlaceholder: "you@example.com",
    submit: { explorer: "Join the waitlist", maker: "Get early access" },
    categories: { label: "Pick your categories (optional)", hint: "Up to 5. Your launch-day email starts with these." },
    productUrl: { label: "Your product's link (optional)", placeholder: "https://yourapp.com" },
    productCategory: "Category (optional)",
    foundVia: {
      label: "Where did you find us? (optional)",
      options: { tiktok: "TikTok", instagram: "Instagram", x: "X", friend: "A friend", search: "Search", other: "Other" },
    },
    consent: "We'll only email you about the waitlist and launch.",
    privacyLink: "Privacy Policy",
    /** Only rendered from the WAITLIST_COUNT_MIN limit, with `count` read from the DB. */
    waitingCount: (count: number) => `${count} people are waiting`,
    sent: {
      restart: "Wrong email? Start again",
    },
    errors: {
      email: "Enter a valid email address.",
      rateLimited: "Too many attempts. Wait a minute and try again.",
      generic: "Something went wrong. Try again.",
    },
    blocks: {
      ranking: { title: "Ranked by real people", text: "Top this week and Trending, built from saves, tries and feedback — not paid votes.", link: "How ranking works" },
      firstToTry: { title: "First to try", text: "Test apps before launch and claim perks makers give only here." },
      makers: {
        title: "Makers get in a week early",
        text: "Launching something? Get access 7 days before launch: verify your domain and publish your product, so it's live the moment we open.",
      },
    },
    faq: {
      title: "FAQ",
      what: {
        q: (siteName: string) => `What is ${siteName}?`,
        a: "The new apps worth trying — before everyone else, with perks you can't get anywhere else. We rank every new launch by what real people save, try and talk about.",
      },
      when: { q: "When do you launch?", a: (date: string | null) => (date ? `On ${date}. We'll email you that day.` : "Soon. We'll email you on launch day.") },
      free: {
        q: "Is it free?",
        a: (siteName: string) => `Yes. Discovering apps on ${siteName} is free, and listing your product is free.`,
      },
      pay: { q: "Can makers pay to rank higher?", a: "No. Nobody can pay to rank higher, and makers' own activity doesn't count." },
      makers: {
        q: "I build apps. What do I get?",
        a: "Access 7 days before launch to verify your domain and publish your product. It's live on launch day, and the top products in each category are featured in our launch-day email.",
      },
      emails: {
        q: "What will you email me?",
        a: "One invite on launch day with the top picks in your categories. Makers also get their early-access invite. You can unsubscribe from any email with one click.",
      },
      data: { q: "What do you do with my email?", a: "We use it only for these emails and never sell it.", link: "See our Privacy Policy." },
    },
    confirmed: {
      title: "You're on the list.",
      explorer: (date: string | null) => (date ? `On launch day (${date}) we'll email you the top picks in your categories.` : "On launch day we'll email you the top picks in your categories."),
      explorerNoCategories: (date: string | null) => (date ? `On launch day (${date}) we'll email you this week's top new apps.` : "On launch day we'll email you this week's top new apps."),
      maker: (date: string | null) =>
        `${date ? `You get access on ${date}.` : "You get access a week before launch."} We'll email you a link to create your account, verify your domain and publish your product.`,
      shareTitle: "Share your link",
      shareText: "Friends who join through it are counted here.",
      referrals: (n: number) => (n === 1 ? "1 person joined through your link" : `${n} people joined through your link`),
      copy: "Copy link",
      copied: "Copied",
      invalid: "This link has expired or doesn't work. Enter your email again and we'll send a new one.",
      back: "Back to the waitlist",
    },
    unsubscribe: {
      working: "Unsubscribing…",
      button: "Unsubscribe",
      done: "You're unsubscribed. We won't email you about the waitlist again.",
      rejoin: "Changed your mind? Join again",
    },
    emails: {
      footer: (siteName: string) => `You're getting this because you joined the ${siteName} waitlist.`,
      unsubscribe: "Unsubscribe",
      confirm: {
        subject: (siteName: string) => `Confirm your spot on the ${siteName} waitlist`,
        explorer: "Confirm your email to join the waitlist. On launch day you'll get the new apps worth trying in your categories.",
        maker: "Confirm your email to join the waitlist. Makers get access a week before launch.",
        expiry: "The link works for 48 hours. If you didn't sign up, ignore this email.",
        button: "Confirm my email",
      },
      makerInvite: {
        subject: (siteName: string) => `Your early access to ${siteName}`,
        intro: (launchDate: string | null) =>
          `You're in a week before everyone else. Create your account, verify your domain and publish your product before launch day${launchDate ? ` (${launchDate})` : ""}.`,
        live: "Products published before launch are live on day one, and the top ones in each category are featured in our launch-day email.",
        expiry: "The link works for 30 days.",
        button: "Create my account",
      },
      launch: {
        /** The launch-day notification line (COPY.md "Notificări digest"). */
        subject: "We're live. Here's what's worth trying in your categories.",
        subjectNoCategories: "We're live. Here's what's worth trying this week.",
        /** "[Product] — [tagline]" */
        item: (title: string, tagline: string) => `${title} — ${tagline}`,
        button: "Build my feed — free",
      },
    },
    accountsClosed: "Accounts open on launch day. Join the waitlist to get an invite.",
    login: { before: "New here? ", link: "Join the waitlist" },
  },

  /** Feed and category pages: tabs, badges and filters. */
  feed: {
    tabs: { top: "Top this week", trending: "Trending", new: "New" },
    tabsNote: "Ranked by saves, perk claims and feedback from verified accounts. Makers can't pay to move up.",
    rankingLink: "How ranking works",
    /** /top, /trending and /new after the visitor limit: the category banner without a category (approved at step 10). */
    visitorBanner: "You've seen this week's top picks. Create a free account to see every launch and get the weekly top in your notifications.",
    badges: {
      staffPick: "Staff pick",
      aiPowered: "AI-powered",
      justLaunched: "Just launched",
      foundingMaker: "Founding maker",
      preLaunch: "Pre-launch",
    },
    filters: {
      aiPowered: "AI-powered",
      pricing: { free: "Free", freemium: "Freemium", paid: "Paid" },
      stage: { preLaunch: "Pre-launch", launched: "Launched" },
      hasPerk: "Has a perk",
      /** `api` is listed in docs/RANKING.md, not in the COPY.md filter line. */
      platform: { web: "Web", ios: "iOS", android: "Android", extension: "Extension", desktop: "Desktop", api: "API" },
    },
  },

  onboarding: {
    title: "What are you into?",
    subtitle: "Pick at least 3. We'll rank what's new in each.",
    digest: {
      question: "How often do you want your top picks?",
      daily: "Daily",
      weekly: "Weekly (recommended)",
      /** Digest frequency `off` (docs/COPY.md, D11). */
      appOnly: "Only in the app",
    },
    done: "Done. Here's what's worth trying this week.",
  },

  category: {
    h1: (name: string) => `New ${name} apps worth trying — this week`,
    intro: (name: string) => `Every new launch in ${name}, including AI-powered tools, ranked by real signals. Updated daily.`,
    visitorBanner: (name: string) =>
      `You've seen this week's top ${name} picks. Create a free account to see every launch and get the weekly top in your notifications.`,
  },

  /** The weekly category archive, /c/[category]/week/[yyyy]-[ww] (approved at step 10). */
  weekArchive: {
    h1: (name: string, week: number, year: number) => `Top new ${name} apps — week ${week}, ${year}`,
    /** Link to the previous archived week */
    previous: (week: number, year: number) => `Week ${week}, ${year}`,
  },

  /** The public /perks page; its H1 is the docs/SEO.md title (approved at step 10). */
  perksPage: {
    h1: "App Deals, Free Trials and Coupons",
    empty: "No perks right now. Makers add new ones every week.",
  },

  product: {
    perkBadge: (siteName: string) => `Only on ${siteName}`,
    perkSignIn: "Sign in to claim this perk",
    betaBadge: "Pre-launch — try it before everyone else",
    feedbackPrompt: "Tell the maker what would make this a must-have.",
  },

  /** The public /ranking page. */
  ranking: {
    title: "How ranking works",
    body: 'Top this week ranks new launches by what people did with them in the last 7 days: saves, perk claims, visits to the product and feedback. Trending looks at the last 48 hours and favors what is picking up speed. Only verified accounts older than a few days count, each person counts once per product, and makers\' own activity doesn\'t count. Our team adds a few Staff picks each week, always labeled. Nobody can pay to rank higher; if we ever show sponsored listings, they will be marked "Sponsored" and kept out of the ranking.',
  },

  notifications: {
    /** COPY.md says "Top 5"; `count` is the number of products actually in the digest. */
    digestTitle: (category: string, count: number) => `Top ${count} new in ${category} this week`,
    /** Sent once, on launch day. */
    launchDay: "We're live. Here's what's worth trying in your categories.",
  },

  about: {
    body: (siteName: string) =>
      `${siteName} exists because the best new apps get buried. Every day people ship apps — some built in a weekend, some with AI at their core — and most never reach the people who'd love them. We rank every new launch by what real people save, try and talk about, so you find the good ones first, and makers get seen for what they build, not for how loud they launch.`,
  },

  /** The /makers page (docs/COPY.md "Pagina /makers"); its H1 and CTA come from `makers` / `prelaunch.makers`. */
  makersPage: {
    why: {
      title: "Why list here",
      text: "People come here to find new apps before everyone else. List yours and it reaches them in the categories they follow — in their feed and in their weekly top.",
      free: "It's free: verify your domain, paste your link, and you're live.",
    },
    perks: {
      title: "Perks",
      text: "Offer an extended trial, a discount or a code that people can only claim here. Every claim brings you a signed-up user, and claims count toward your ranking.",
    },
    preLaunch: {
      title: "Pre-launch testing",
      text: "Not launched yet? List your product as Pre-launch and find your first testers. They can send feedback straight to you, in public or in private, and vote on your roadmap.",
    },
  },

  /** Homepage block for makers (the pre-launch version is in `prelaunch.makers`). */
  makers: {
    title: "Built something? Get it in front of people who actually try new apps.",
    cta: "List your product — free",
    /** Publish/edit form field, docs/RANKING.md. */
    form: { includesAi: "Includes AI features" },
    /** Maker dashboard; wording approved in the step 3 plan (docs/RANKING.md quality conditions). */
    checklist: {
      title: "To appear in Top and Trending",
      link: "Your link answers",
      image: "At least one image",
      description: "A description of 80+ characters",
      tagline: "A tagline",
      noOpenReview: "No open review",
    },
  },

  /**
   * Title and meta description templates, docs/SEO.md. Titles without the site name get " · <site>"
   * appended; apps/web/src/lib/seo.ts truncates them to 60 / 155 characters.
   */
  seo: {
    home: {
      title: "New Apps & AI Tools Worth Trying",
      description: "Find the new apps worth trying before everyone else. Ranked by real people, with early access and perks you can't get anywhere else. Free.",
    },
    category: {
      title: (name: string) => `Best New ${name} Apps This Week`,
      /** `name` as it reads mid-sentence ("productivity", "sales & CRM") */
      description: (name: string) => `New ${name} apps and AI tools, ranked by what real people save and try. Updated daily, with free trials and perks.`,
    },
    top: {
      title: "Top New Apps This Week",
      description: "This week's best new apps and AI tools, ranked by saves, tries and feedback from verified users. No paid rankings.",
    },
    /** /new has no docs/SEO.md template; approved at step 10. */
    new: {
      title: "New Apps & AI Tools This Week",
      description: "Every new app and AI tool launched in the last 7 days, newest first. Verified makers, free trials and perks.",
    },
    /** Weekly category archive; approved at step 10. `midName` is the name as it reads mid-sentence. */
    week: {
      title: (name: string, week: number, year: number) => `Best New ${name} Apps, Week ${week} ${year}`,
      description: (midName: string, week: number, year: number) =>
        `The new ${midName} apps and AI tools launched in week ${week} of ${year}, ranked by what real people saved and tried.`,
    },
    product: {
      title: (product: string, tagline: string) => `${product}: ${tagline}`,
      /** The perk sentence after the short description, e.g. "60 days free on Tryworthy." */
      perk: (perkTitle: string, siteName: string) => `${perkTitle} on ${siteName}.`,
    },
    maker: {
      /** Suffix after the maker's name; the full title is "<name> — Products on <site>". */
      titleSuffix: (siteName: string) => ` — Products on ${siteName}`,
      description: (name: string, siteName: string) => `New apps built by ${name}, verified on ${siteName}.`,
    },
    /** The homepage while the waitlist runs: the homepage title, the description adapted (docs/COPY.md "Waitlist"). */
    waitlist: {
      description: "Find the new apps worth trying before everyone else. Join the free waitlist for early access and perks you can't get anywhere else.",
    },
    perks: {
      title: "App Deals, Free Trials and Coupons",
      description: "Exclusive free trials, discounts and coupons from the makers of new apps and AI tools. Free account required to claim.",
    },
  },

  /** Legal pages (docs/LEGAL.md); their text lives in apps/web/src/content/legal. */
  legal: {
    draft: "Draft — pending legal review",
    updated: (date: string) => `Last updated ${date}`,
    contents: "Contents",
    /** Sign-up and onboarding: "By creating an account you agree to our Terms and Privacy Policy" with links. */
    consent: { before: "By creating an account you agree to our ", terms: "Terms", and: " and ", privacy: "Privacy Policy" },
    age: (minAge: string) => `I am at least ${minAge} years old`,
    ageRequired: "Confirm your age to continue.",
    /** One-time notice for signed-in users when TERMS_VERSION changes. */
    termsUpdated: "We've updated our Terms of Service.",
    termsChanges: "See what changed",
    termsDismiss: "Got it",
  },

  /**
   * Settings → "Your data" (docs/LEGAL.md, docs/positioning-pack.md step 13). The section title, the
   * two action names, "DELETE" and "Deleted user" come from the docs; the helper lines are not in COPY.md.
   */
  yourData: {
    title: "Your data",
    text: "Download a copy of your data, or delete your account.",
    exportTitle: "Export my data",
    exportText: (hours: number) => `A JSON file with your profile, categories, saves, feedback, votes, claimed perks, domains, notifications and ranking signals. The link works for ${hours} hours.`,
    exportReady: "Your export is ready.",
    download: "Download JSON",
    linkExpires: (when: string) => `Link expires ${when}.`,
    deleteTitle: "Delete my account",
    deleteText: 'This removes your account, saves, votes, claimed perks, notifications and ranking signals. Public feedback stays, shown as "Deleted user". If you\'re a maker, your products are removed. This can\'t be undone.',
    deleteConfirm: (word: string) => `Type ${word} to confirm`,
  },
  /** docs/positioning-pack.md step 13: the author of public feedback after their account is deleted. */
  deletedUser: "Deleted user",

  /**
   * Report reasons. The public ones are the list in docs/LEGAL.md and report.md; the member dialog on
   * product pages keeps its own labels.
   */
  reportReasons: {
    spam: "Spam",
    scam: "Scam or fraud",
    dead_link: "Dead link",
    prohibited: "Prohibited content",
    other: "Other",
    illegal: "Illegal content",
    ip: "Intellectual property",
    malware: "Malware",
  },

  /**
   * The public /report form (docs/LEGAL.md, docs/positioning-pack.md step 14). The good-faith line
   * quotes report.md; the other helper lines are not in COPY.md.
   */
  publicReport: {
    title: "Report a product",
    url: "Product link",
    urlHint: "Its page on Tryworthy, or the product's own website.",
    reason: "Reason",
    explanation: "Explanation",
    explanationHint: "Why you believe the product is illegal or breaks our rules. Add any evidence.",
    email: "Your email (optional)",
    emailHint: "We confirm your report and tell you what we decided.",
    goodFaith: "I believe in good faith that the information in this report is accurate and complete.",
    submit: "Send report",
    received: "We received your report.",
    receivedText: (product: string, reference: string) => `Your report about ${product} has the reference ${reference}. A person will review it.`,
    receivedEmail: "We sent this confirmation to your email too.",
    another: "Report another product",
  },

  /**
   * Statements of reasons and contests (docs/LEGAL.md, step 14). Messages to reporters name only the
   * product and the decision, never the maker. Not in COPY.md.
   */
  moderation: {
    what: {
      hidden: (product: string) => `Your product ${product} was hidden.`,
      removed: (product: string) => `Your product ${product} was removed.`,
      suspended: "Your account was suspended.",
    },
    titles: {
      product: "A decision about your product",
      account: "Your account was suspended",
      reversed: "A decision was reversed",
      contest: "Your contest was reviewed",
    },
    hiddenBySuspension: "Hidden because the maker's account was suspended.",
    productsHidden: (n: number) => (n === 1 ? "Your live product is hidden while the suspension lasts." : `Your ${n} live products are hidden while the suspension lasts.`),
    autoHideFacts: (n: number, reasons: string) => `${n} reports from established accounts said this listing breaks our rules (${reasons}). It is hidden until a person reviews it.`,
    autoBanRejectedReports: (n: number) => `${n} of your reports were rejected after review. Reporting products that don't break the rules is not allowed.`,
    autoBanRemovedProducts: (n: number) => `${n} of your products were removed after review.`,
    rule: (label: string, url: string) => `Rule: ${label} (${url})`,
    automated: "This decision was made automatically. A person reviews every contest.",
    manual: "A person made this decision.",
    contestHow: (months: number, url: string) => `You can contest it once within ${months} months: ${url}`,
    restored: (product: string) => `Your product ${product} is visible again.`,
    unsuspended: "Your account is no longer suspended.",
    contestOutcome: {
      upheld: "We reviewed your contest and kept the decision.",
      reversed: "We reviewed your contest and reversed the decision.",
    },
    reportOutcome: {
      title: (product: string) => `Your report about ${product}`,
      upheld: (product: string, action: string, rule: string) => `We reviewed your report about ${product}. The product was ${action}. Rule: ${rule}.`,
      rejected: (product: string) => `We reviewed your report about ${product} and found no breach of our rules, so the listing stays up.`,
    },
    /** Decision pages (dashboard and suspension page). */
    page: {
      title: "Decisions",
      intro: "Decisions about your products or your account, with the reasons. You can contest each one once.",
      empty: "No decisions about your products or your account.",
      suspendedTitle: "Your account is suspended",
      suspendedIntro: "You can read why below and contest the decision. Everything else is unavailable while the suspension lasts.",
      rule: "Rule:",
      automated: "Automated",
      byPerson: "Made by a person",
      reversed: "Reversed",
      contestLabel: "Why should this decision change?",
      contestSubmit: "Contest this decision",
      contestUntil: (date: string) => `You can contest it until ${date}.`,
      contestSent: "Contest sent. A person will review it.",
      contested: (date: string) => `You contested this on ${date}.`,
      coveredBySuspension: "Contest the account suspension to contest this.",
      expired: "The time to contest this decision has passed.",
    },
  },

  /** docs/LEGAL.md. "Maker Terms" (the page title) is added so all 7 legal pages are in the footer. */
  footer: {
    /** The promise from docs/POSITIONING.md. */
    tagline: "The new apps worth trying — before everyone else, with perks you can't get anywhere else.",
    links: {
      about: "About",
      makers: "Makers",
      ranking: "How ranking works",
      guidelines: "Guidelines",
      terms: "Terms",
      makerTerms: "Maker Terms",
      privacy: "Privacy",
      cookies: "Cookies",
      report: "Report content",
      legal: "Legal",
      contact: "Contact",
    },
    copyright: (year: number, operator: string) => `© ${year} ${operator}`,
  },
};

export type Copy = typeof en;
