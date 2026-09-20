import Image from "next/image";

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-border">
      <Image src="/la-skyline.jpg" alt="" fill sizes="(max-width:768px) 100vw, 1152px"
        className="object-cover opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/40" />
      <div className="relative flex flex-wrap items-end justify-between gap-3 px-6 py-8 md:px-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
          {sub && <p className="mt-2 max-w-xl text-sm text-muted">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="rule-gold relative mx-6 mb-6 w-24 md:mx-8" />
    </div>
  );
}
