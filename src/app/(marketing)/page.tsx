import { Fragment, type ReactNode } from "react";
import { Hero } from "@/components/marketing/hero";
import { StatsBand } from "@/components/marketing/stats-band";
import { CategoriesSection } from "@/components/marketing/categories-section";
import { ProgramsSection } from "@/components/marketing/programs-section";
import { WhyUs } from "@/components/marketing/why-us";
import { ProcessSection } from "@/components/marketing/process-section";
import { PlacedStudents } from "@/components/marketing/placed-students";
import { Testimonials } from "@/components/marketing/testimonials";
import { CertificateShowcase } from "@/components/marketing/certificate-showcase";
import { PlacementStories } from "@/components/marketing/placement-stories";
import { LearnerVideos } from "@/components/marketing/learner-videos";
import { FaqSection } from "@/components/marketing/faq-section";
import { EnquiryForm } from "@/components/marketing/enquiry-form";
import { isGlobalSection } from "@/lib/validations/homepage";
import {
  getHomeSections,
  type HomeSection,
} from "@/server/services/homepage-service";

/**
 * The landing page is assembled from `HomeSection` rows rather than a fixed
 * list of components: Admin → Homepage decides which bands appear, in what
 * order, and what every word inside them says.
 */
function renderSection(section: HomeSection): ReactNode {
  switch (section.key) {
    case "hero":
      return <Hero data={section.data} />;
    case "stats":
      return <StatsBand data={section.data} />;
    case "categories":
      return <CategoriesSection data={section.data} />;
    case "programs":
      return <ProgramsSection data={section.data} />;
    case "whyUs":
      return <WhyUs data={section.data} />;
    case "process":
      return <ProcessSection data={section.data} className="bg-muted/30 border-y" />;
    case "placedStudents":
      return <PlacedStudents data={section.data} />;
    case "testimonials":
      return <Testimonials data={section.data} />;
    case "certificate":
      return <CertificateShowcase data={section.data} />;
    case "placementStories":
      return <PlacementStories data={section.data} />;
    case "learnerVideos":
      return <LearnerVideos data={section.data} />;
    case "faq":
      return <FaqSection data={section.data} />;
    case "enquiry":
      return <EnquiryForm data={section.data} />;
    // The closing banner is drawn by the marketing layout, on every page.
    case "cta":
      return null;
  }
}

export default async function HomePage() {
  const sections = await getHomeSections();

  return (
    <>
      {sections
        .filter((section) => section.enabled && !isGlobalSection(section.key))
        .map((section) => (
          <Fragment key={section.key}>{renderSection(section)}</Fragment>
        ))}
    </>
  );
}
