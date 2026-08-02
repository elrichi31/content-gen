import type { CarouselDocument } from "@content-gen/domain/carousel";

// Puente entre los componentes portados de `carousel-ai` (que importaban `@/lib/types`)
// y el contrato versionado de Content Gen. Los campos coinciden uno a uno.
export type Slide = CarouselDocument["slides"][number];
export type SlideListItem = NonNullable<Slide["listItems"]>[number];
export type PostCaption = CarouselDocument["caption"];

// La marca en Content Gen vive en `brand_kits`; aquí solo se necesita lo que pinta el slide.
export type BrandSettings = { name: string; logoUrl: string | null; colors: string[] };
