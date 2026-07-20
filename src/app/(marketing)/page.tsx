import { Hero } from "@/components/marketing/hero";
import { StatsBand } from "@/components/marketing/stats-band";
import { CategoriesSection } from "@/components/marketing/categories-section";
import { ProgramsSection } from "@/components/marketing/programs-section";
import { WhyUs } from "@/components/marketing/why-us";
import { PlacedStudents } from "@/components/marketing/placed-students";
import { Testimonials } from "@/components/marketing/testimonials";
import { CertificateShowcase } from "@/components/marketing/certificate-showcase";
import { PlacementStories } from "@/components/marketing/placement-stories";
import { LearnerVideos } from "@/components/marketing/learner-videos";
import { EnquiryForm } from "@/components/marketing/enquiry-form";
import { CtaBand } from "@/components/marketing/cta-band";

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatsBand />
      <CategoriesSection />
      <ProgramsSection />
      <WhyUs />
      <PlacedStudents />
      <Testimonials />
      <CertificateShowcase />
      <PlacementStories />
      <LearnerVideos />
      <EnquiryForm />
      <CtaBand />
    </>
  );
}
