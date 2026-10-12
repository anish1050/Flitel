import Image from "next/image";

// Only hosts listed in next.config.ts can be resized by Next.js; anything else is shown as it comes.
const resizableHost = /^https:\/\/static\.cupid\.travel\//;

type Props = { src: string; className?: string; sizes: string; eager?: boolean };

/** A supplier photo, resized and compressed by the web app when its host is known. */
export function RemotePhoto({ src, className, sizes, eager = false }: Props) {
  if (!resizableHost.test(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt="" loading={eager ? "eager" : "lazy"} />;
  }
  return (
    <Image
      className={className}
      src={src}
      alt=""
      width={960}
      height={640}
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
    />
  );
}
