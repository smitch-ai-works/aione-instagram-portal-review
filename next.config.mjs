const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/aione-instagram';
if (!/^(\/[a-zA-Z0-9_-]+)+$/.test(basePath)) throw new Error('Invalid portal base path');
export default {
  basePath,
  reactStrictMode: false,
  poweredByHeader: false,
  async headers() {
    return [{source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
      {key:'X-Frame-Options',value:'SAMEORIGIN'}
    ]}];
  }
};
