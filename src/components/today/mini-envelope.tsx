/**
 * A small envelope for list rows (Today's next letter): flap, wax seal with the recipient's
 * initial, and a glowing seal when the letter is ready to open. The full-size `Envelope` is laid
 * out for cards and doesn't shrink.
 */
export function MiniEnvelope({ initial, ready = false }: { initial: string; ready?: boolean }) {
  return (
    <span aria-hidden className="relative block h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-mint ring-1 ring-line">
      <span className="absolute inset-0 bg-aqua [clip-path:polygon(0_0,100%_0,50%_62%)]" />
      <span
        className="absolute top-1/2 left-1/2 -mt-1.5 -ml-2.5 grid size-5 place-items-center rounded-full text-[10px] font-extrabold text-snow"
        style={{ background: "var(--seal)", ...(ready ? { animation: "seal-glow 2.4s ease-in-out infinite" } : {}) }}
      >
        {initial}
      </span>
    </span>
  );
}
