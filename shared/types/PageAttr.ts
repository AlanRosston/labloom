import type { BuiltinAttrValues as Intrinsics } from "../attrs/builtins";

type IntrinsicPageAttr = {
    [K in keyof Intrinsics]: {
        id: K;
        value: Intrinsics[K];
    };
}[keyof Intrinsics];

type CustomPageAttr = {
    id: `custom:${string}`;
} & (
    | { type: "string"; value: string | null; }
    | { type: "number"; value: number | null; }
    | { type: "boolean"; value: boolean | null; }
    | { type: "select"; value: string | null; }
);

export type PageAttr = IntrinsicPageAttr | CustomPageAttr;