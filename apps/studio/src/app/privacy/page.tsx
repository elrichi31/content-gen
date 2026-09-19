import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

// Lee LEGAL_CONTACT_EMAIL en cada petición: con el render estático quedaría fijado al del build.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy Policy · Content Gen" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <LegalSection title="Who this applies to">
        Content Gen is a private tool. This policy covers the team members who sign in to it and any TikTok account that a team member chooses to connect.
      </LegalSection>
      <LegalSection title="Information we collect">
        For team members: the name, email address and password hash used to sign in. For a connected TikTok account: the account&apos;s open ID, its follower count, following count, total likes and video count, and the OAuth access and refresh tokens that TikTok issues so the counters can be read again later. We do not collect your TikTok password, private messages or private videos.
      </LegalSection>
      <LegalSection title="How we use it">
        The TikTok counters are shown in the Performance dashboard, and a daily snapshot is kept so you can see how they change over time. The tokens are used only to request those counters from TikTok. TikTok data is not used for advertising, profiling or automated decisions, and is not sent to any AI provider.
      </LegalSection>
      <LegalSection title="Storage and sharing">
        Data is stored in the database of the server that hosts Content Gen, and tokens are kept on the server side only. We do not sell or share it with third parties. The only outside services involved are TikTok, which provides the data, and the hosting provider that runs the server.
      </LegalSection>
      <LegalSection title="Cookies">
        Content Gen uses a session cookie to keep you signed in, and a short-lived cookie (10 minutes) while a TikTok connection is in progress. It does not use advertising or tracking cookies.
      </LegalSection>
      <LegalSection title="Retention and deletion">
        Snapshots and tokens are kept while the TikTok account stays connected. You can revoke access at any time from your TikTok account settings, and you can ask the administrator to delete your stored tokens, snapshots and team account.
      </LegalSection>
      <LegalSection title="Changes">
        This policy may be updated from time to time. The date at the top of this page shows the latest revision.
      </LegalSection>
    </LegalPage>
  );
}
