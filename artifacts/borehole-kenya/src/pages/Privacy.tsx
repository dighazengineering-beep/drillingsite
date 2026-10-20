import { IMAGES, pageBackdrop } from "@/lib/images";
import { LiveTitle } from "@/components/LiveTitle";

const h = "mt-5 text-base font-bold text-foreground";
const p = "mt-1.5 text-sm leading-relaxed text-muted-foreground";

export default function Privacy() {
  return (
    <div className="min-h-[calc(100dvh-4rem)] px-4 pt-24 pb-12" style={pageBackdrop(IMAGES.backdropWater, "center 50%")}>
      <article className="mx-auto max-w-3xl rounded-2xl bg-card/95 p-5 shadow-xl sm:p-7">
        <h1 className="text-xl font-bold text-foreground"><LiveTitle text="Privacy Policy" hi="#0ea5e9" /></h1>
        <p className="mt-1 text-xs text-muted-foreground">Dighaz Engineering Limited · Last updated 20 October 2026</p>

        <p className={p}>
          This policy explains what information Dighaz Engineering Limited (“we”, “us”) collects on this website, why we collect it, and the choices you have.
        </p>

        <h2 className={h}>What we collect</h2>
        <ul className={`${p} list-disc space-y-1 pl-5`}>
          <li><b className="text-foreground">Enquiries:</b> your name, phone number, email, county and message when you contact us or request a quote.</li>
          <li><b className="text-foreground">Member accounts:</b> your name, email address, phone number and a password (stored only in scrambled form), or, if you use Google sign-in, the name and email address on your Google account.</li>
          <li><b className="text-foreground">Referrals:</b> the names, phone numbers and job details of clients that members register or that arrive through a member’s link, so we can credit the right member.</li>
          <li><b className="text-foreground">Video comments:</b> the name and comment you post on the Project Videos page.</li>
          <li><b className="text-foreground">On your device:</b> small bits of saved data (such as your sign-in, cart and a referral code) so the site works and loads faster.</li>
        </ul>

        <h2 className={h}>Google sign-in</h2>
        <p className={p}>
          If you choose “Continue with Google”, Google tells us your name and email address. We use them only to create and sign you in to your member account. We do not see your Google password, and we do not read your email, contacts or any other Google data.
        </p>

        <h2 className={h}>How we use it</h2>
        <ul className={`${p} list-disc space-y-1 pl-5`}>
          <li>To reply to your enquiry and carry out surveys, drilling, pump and solar work.</li>
          <li>To run the member referral programme: tracking referrals and working out and paying commission.</li>
          <li>To keep the site secure and working properly.</li>
        </ul>
        <p className={p}>We do not sell your information, and we do not share it with advertisers.</p>

        <h2 className={h}>Who can see it</h2>
        <p className={p}>
          Our staff see enquiries and referrals so they can do the work. A member sees only the clients they registered and the status of the commission on them. Our site is hosted by trusted service providers (for web hosting, database and video storage) who handle data on our behalf.
        </p>

        <h2 className={h}>How long we keep it</h2>
        <p className={p}>We keep information for as long as it is needed for the services and records above, then delete it.</p>

        <h2 className={h}>Your choices</h2>
        <p className={p}>
          You can ask us to see, correct or delete your information, or to close your member account, at any time by contacting us below.
        </p>

        <h2 className={h}>Contact us</h2>
        <p className={p}>
          Dighaz Engineering Limited, Rhapta Rd, Westlands, Nairobi, Kenya<br />
          Email: info@dighazengineering.com · dighazengineering@gmail.com<br />
          Phone: +254 110 699 444 · WhatsApp: +254 719 117 660
        </p>

        <p className={`${p} mt-5`}>We may update this policy from time to time. The date at the top shows when it last changed.</p>
      </article>
    </div>
  );
}
