import { FinishCTASection } from './finish-cta-section';
import { HeroSection } from './hero-section';
import { HowItWorksSection } from './how-it-works-section';
import { PartnerSection } from './partner-section';
import { PreviewGallerySection } from './preview-gallery-section';
import { ReviewSection } from './review-section';

export function LandingPage() {
  return (
    <div className="flex flex-col overflow-hidden bg-background">
      <HeroSection />
      <HowItWorksSection />
      <PreviewGallerySection />
      <ReviewSection />
      <PartnerSection />
      <FinishCTASection />
    </div>
  );
}
