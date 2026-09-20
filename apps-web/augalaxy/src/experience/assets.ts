/// <reference types="vite/client" />
// Resolve against the bundle, so the same assets work at / and /augalaxy/.
export const assetURL=(file:string)=>new URL((import.meta.env?.DEV?'../../':'../')+file,import.meta.url).href;
