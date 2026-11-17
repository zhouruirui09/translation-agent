export const metadata = {
  title: '英译汉翻译工作台',
  description: '多模型译文生成与逐句对比',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
