import { CloudCard } from "@/components/cloud-card";
import { ContributeCard } from "@/components/contribute-card";
import { DeploymentCard } from "@/components/deployment-card";
import { HowItWorksCard } from "@/components/how-it-works-card";
import { IntroCard } from "@/components/intro-card";
import { OpenSourceCard } from "@/components/open-source-card";
import { OpenAICompatibilityCard } from "@/components/openai-compatibility-card";
import { ProfileCard } from "@/components/profile-card";
import { PromptCard } from "@/components/prompt-card";
import { ProxyCard } from "@/components/proxy-card";
import { TraitsCard } from "@/components/traits-card";

export default function Home() {
  return (
    <main className="w-full max-w-5xl mx-auto p-4 md:p-6 xl:p-8 space-y-4 md:space-y-6 lg:space-y-8">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-stretch">
        <div className="md:col-span-2 h-full">
          <IntroCard />
        </div>
        <OpenSourceCard />
        <OpenAICompatibilityCard />
        <div className="md:col-span-2 h-full">
          <ProxyCard />
        </div>
        <div className="md:col-span-2 h-full">
          <PromptCard />
        </div>
        <HowItWorksCard />
        <div className="md:col-span-3">
          <ProfileCard />
        </div>
        <div className="md:col-span-2 h-full">
          <TraitsCard />
        </div>
        <DeploymentCard />
        <ContributeCard />
        <div className="md:col-span-2 h-full">
          <CloudCard />
        </div>
      </section>
      <p className="text-center text-sm text-muted-foreground">
        Built with ❤️ for the AI community
      </p>
    </main>
  );
}
