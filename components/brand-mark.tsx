import Image from "next/image";

export function BrandMark() {
  return <Image src="/gramello-mark.png" alt="" width={44} height={44}
    className="logo-mark" unoptimized priority />;
}

export function BrandWordmark() {
  return <span className="brand-wordmark">gramello<span className="text-primary">.</span></span>;
}
