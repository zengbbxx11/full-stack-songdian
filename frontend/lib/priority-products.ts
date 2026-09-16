export const PRIORITY_PRODUCT_SLUGS = ["dc403", "dc105", "dc325", "dc417x"] as const;

// Editorial defaults from the current product specifications. Explicit CMS SEO always wins.
export const PRIORITY_PRODUCT_SEO: Record<string, { title: string; description: string }> = {
  dc403: { title: "DC403 1080P Compact Camera with 16X Digital Zoom",
    description: "DC403 compact camera with a 5MP CMOS sensor, up to 44MP interpolated photos, 1080P video and 16X digital zoom. Explore OEM/ODM manufacturing with Songdian." },
  dc105: { title: "DC105 4K Digital Camera with Flip Screen | OEM/ODM",
    description: "DC105 digital camera with a 21MP sensor, native 4K 30fps video and a 180-degree flip screen. Discuss OEM/ODM customization with Songdian Technology." },
  dc325: { title: "DC325 Dual-Screen Compact Camera | OEM/ODM",
    description: "DC325 compact camera with a 21MP CMOS sensor, front and rear screens, and up to 96MP interpolated photos. Request OEM/ODM project details from Songdian." },
  dc417x: { title: "DC417X Dual-Camera Model with 7X Optical Zoom",
    description: "DC417X compact camera with a 50MP Sony main sensor, 13MP selfie sensor and 7X optical zoom. Explore OEM/ODM camera manufacturing with Songdian." },
};
