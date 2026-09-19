import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

// Lee LEGAL_CONTACT_EMAIL en cada petición: con el render estático quedaría fijado al del build.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms of Service · Content Gen" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <LegalSection title="What Content Gen is">
        Content Gen is a private tool used by its owner and the team members they invite to create marketing content with AI and to review the performance of their own accounts. It is not offered to the general public: there is no public sign-up, and accounts are created manually by the administrator.
      </LegalSection>
      <LegalSection title="Connecting a TikTok account">
        A team member can optionally connect a TikTok account through TikTok Login Kit. Content Gen asks only for the user.info.basic and user.info.stats permissions, which let it read the account&apos;s public profile information and counters: follower count, following count, total likes and number of videos. Access is read-only. Content Gen does not post, comment, send messages or access private content on TikTok.
      </LegalSection>
      <LegalSection title="Acceptable use">
        You may connect only a TikTok account that you own or are authorized to manage. You agree to follow TikTok&apos;s Terms of Service and Community Guidelines, and not to use Content Gen to violate the law, infringe the rights of others or interfere with the service.
      </LegalSection>
      <LegalSection title="Ending access">
        You can revoke Content Gen&apos;s access at any time from your TikTok account settings, and the administrator can remove your account and stored data on request. Access may be suspended if these terms are not respected.
      </LegalSection>
      <LegalSection title="No warranty">
        Content Gen is provided &quot;as is&quot;, without warranties of any kind. Statistics come from TikTok and may be delayed or incomplete. To the extent permitted by law, the owner is not liable for losses arising from the use of the service.
      </LegalSection>
      <LegalSection title="Changes">
        These terms may be updated from time to time. The date at the top of this page shows the latest revision.
      </LegalSection>
    </LegalPage>
  );
}
