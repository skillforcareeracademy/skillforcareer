"use client";

import { IdCard, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileClient } from "@/components/dashboard/profile-client";
import { StudentDetailsClient } from "@/components/student/student-details-client";
import type { Profile } from "@/server/services/profile-service";
import type { StudentDetailView } from "@/server/services/student-detail-service";

const TRIGGER = "gap-1.5";

/**
 * The learner's profile in two tabs — "Basic details and My details ke do tab
 * hone chahiye". Basic details is the account form everyone has; My details is
 * the onboarding record (address, documents, schooling, CV). Both carried under
 * one header rather than split across two routes.
 */
export function StudentProfileTabs({
  profile,
  detail,
}: {
  profile: Profile;
  detail: StudentDetailView;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your account and the details the academy keeps on file."
      />
      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic" className={TRIGGER}>
            <UserCircle className="size-4" /> Basic details
          </TabsTrigger>
          <TabsTrigger value="mine" className={TRIGGER}>
            <IdCard className="size-4" /> My details
          </TabsTrigger>
        </TabsList>
        <TabsContent value="basic" className="mt-4">
          <ProfileClient profile={profile} hideHeader />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <StudentDetailsClient view={detail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
