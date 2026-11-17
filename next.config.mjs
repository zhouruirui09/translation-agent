/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // undici 含 Node 动态代码，交给运行时 require，避免 webpack 打包问题
    serverComponentsExternalPackages: ['undici', 'docx', 'mammoth', 'pdfjs-dist'],
  },
};

export default nextConfig;
