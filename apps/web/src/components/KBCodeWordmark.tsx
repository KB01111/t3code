import type { SVGProps } from "react";

/** The "KB" monogram; pair it with "Code" for the full KBCode wordmark. */
export function KBCodeWordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 102 56" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0H13V22L35 0H51L27 24L52 56H36L18 32L13 37V56H0Z" fill="currentColor" />
      <path
        fillRule="evenodd"
        d="M56 0H81C93 0 99 6.5 99 14.5C99 20.5 96 24.5 91 26.5C97.5 28.5 102 33.5 102 41C102 50 95 56 82 56H56ZM69 11V23H79C83.5 23 86 21 86 17C86 13 83.5 11 79 11ZM69 33V45H81C86 45 88.5 43 88.5 39C88.5 35 86 33 81 33Z"
        fill="currentColor"
      />
    </svg>
  );
}
