import { whatsappLink } from "@/lib/utils";

/** Compact WhatsApp button for the header: icon only on phones, icon + label on larger screens. */
export default function WhatsAppButton() {
  return (
    <a
      href={whatsappLink("Hello, I would like to inquire about your borehole drilling services.")}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="button-whatsapp-header"
      aria-label="Chat on WhatsApp"
      title="Chat on WhatsApp"
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#20bd5a] active:scale-95 sm:px-3.5"
    >
      <svg viewBox="0 0 32 32" className="h-[18px] w-[18px] fill-white" aria-hidden="true">
        <path d="M16 2C8.28 2 2 8.28 2 16c0 2.46.64 4.77 1.75 6.78L2 30l7.39-1.73A13.94 13.94 0 0 0 16 30c7.72 0 14-6.28 14-14S23.72 2 16 2zm0 25.5a11.45 11.45 0 0 1-5.85-1.6l-.42-.25-4.39 1.03 1.04-4.27-.27-.43A11.47 11.47 0 0 1 4.5 16C4.5 9.6 9.6 4.5 16 4.5S27.5 9.6 27.5 16 22.4 27.5 16 27.5zm6.3-8.6c-.35-.17-2.06-1.01-2.38-1.13-.32-.11-.55-.17-.78.17-.24.35-.9 1.13-1.1 1.36-.2.23-.4.26-.75.09-.35-.17-1.47-.54-2.8-1.72-1.03-.92-1.73-2.06-1.94-2.41-.2-.35-.02-.54.15-.71.15-.15.35-.4.52-.59.17-.2.23-.35.35-.58.11-.24.05-.44-.03-.61-.09-.17-.78-1.87-1.07-2.57-.28-.67-.57-.58-.78-.59h-.67c-.23 0-.6.09-.91.43-.32.35-1.2 1.17-1.2 2.85s1.23 3.31 1.4 3.54c.17.23 2.42 3.69 5.86 5.18.82.35 1.46.56 1.95.72.82.26 1.57.22 2.16.13.66-.1 2.06-.84 2.35-1.66.29-.81.29-1.51.2-1.66-.08-.15-.3-.23-.65-.4z" />
      </svg>
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
