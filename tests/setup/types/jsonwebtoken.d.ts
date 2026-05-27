declare module 'jsonwebtoken' {
  export function sign(payload: any, secretOrPrivateKey: string, options?: any): string
  export function decode(token: string): any
  const jsonwebtoken: {
    sign(payload: any, secretOrPrivateKey: string, options?: any): string
    decode(token: string): any
  }
  export default jsonwebtoken
}
