import type { AdDocument } from "@content-gen/domain/ad";

// The visual layout components read the full ad document.
export type AdState = AdDocument;
export type AdFormat = AdDocument["format"];
export type AdLayout = AdDocument["layout"];
