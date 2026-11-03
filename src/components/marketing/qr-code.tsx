import QRCode from "qrcode";

/** A QR code drawn on the server as inline SVG (the library never reaches the browser). */
export async function QrCode({ text, size = 176, label }: { text: string; size?: number; label: string }) {
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f3f45", light: "#ffffff" },
  });
  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: size, height: size }}
      className="[&>svg]:h-full [&>svg]:w-full"
      // Our own URL in, the library's SVG out: no user input involved.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
