declare module 'ngeohash' {
  export function encode(latitude: number, longitude: number, precision?: number): string;
  export function neighbors(hash: string): string[];
  export function decode_bbox(hash: string): [number, number, number, number];
}
