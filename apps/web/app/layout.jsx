import "./globals.css";

export const metadata = {
  title: "NaviSense AI — SMCP Bridge Simulator",
  description: "Embodied SMCP training environment",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
