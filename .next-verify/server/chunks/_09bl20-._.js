module.exports=[985902,e=>e.a(async(t,r)=>{try{var a=e.i(698043);e.i(828189);var n=e.i(974389),s=e.i(603735),d=e.i(986237),i=e.i(671468),o=t([a,s,d,i]);[a,s,d,i]=o.then?(await o)():o;let c=["PRESENT","LATE","LEFT_EARLY"],m=(e,t)=>t>0?Math.round(e/t*100):null;async function l(e){let t,r,o,l,u,E,S,p=await a.prisma.$queryRaw`
    SELECT e.id, e.courseId, e.batchId, e.status, e.progressPercent,
           e.enrolledAt, e.completedAt,
           c.title AS courseTitle, b.name AS batchName
      FROM Enrollment e
      JOIN Course c ON c.id = e.courseId
      LEFT JOIN Batch b ON b.id = e.batchId
     WHERE e.userId = ${e}
     ORDER BY e.enrolledAt DESC`,N=p.map(e=>e.courseId),h=p.map(e=>e.batchId).filter(e=>!!e),A=0===N.length,[C,g,R,b,I,O,w,T,v,L,P,f,D]=await Promise.all([A?[]:a.prisma.$queryRaw`
          SELECT ch.courseId,
                 COUNT(DISTINCT l.id) AS total,
                 SUM(CASE WHEN lp.completed = 1 THEN 1 ELSE 0 END) AS completed,
                 COALESCE(SUM(lp.watchedSeconds), 0) AS watchSeconds
            FROM Chapter ch
            JOIN Lesson l ON l.chapterId = ch.id
            LEFT JOIN LessonProgress lp ON lp.lessonId = l.id AND lp.userId = ${e}
           WHERE ch.courseId IN (${n.Prisma.join(N)})
           GROUP BY ch.courseId`,0===h.length?[]:a.prisma.$queryRaw`
          SELECT m.batchId,
                 COUNT(*) AS held,
                 SUM(CASE WHEN a.status IN (${n.Prisma.join(c)}) THEN 1 ELSE 0 END) AS attended,
                 COALESCE(SUM(a.durationSeconds), 0) AS attendedSeconds,
                 -- Only a class with a known finish contributes a length, so the
                 -- comparison is never against a half-known total.
                 COALESCE(SUM(
                   TIMESTAMPDIFF(
                     SECOND,
                     COALESCE(m.actualStart, m.scheduledStart),
                     COALESCE(m.actualEnd, m.scheduledEnd)
                   )
                 ), 0) AS classSeconds
            FROM Meeting m
            LEFT JOIN Attendance a ON a.meetingId = m.id AND a.userId = ${e}
           WHERE m.batchId IN (${n.Prisma.join(h)})
             AND m.status <> 'CANCELLED'
             AND m.scheduledStart <= NOW()
           GROUP BY m.batchId`,a.prisma.$queryRaw`
      SELECT a.courseId,
             COUNT(*) AS submitted,
             SUM(CASE WHEN s.status = 'GRADED' THEN 1 ELSE 0 END) AS graded,
             SUM(CASE WHEN s.score IS NOT NULL THEN s.score ELSE 0 END) AS scoreSum,
             SUM(CASE WHEN s.score IS NOT NULL THEN a.maxScore ELSE 0 END) AS maxSum
        FROM AssignmentSubmission s
        JOIN Assignment a ON a.id = s.assignmentId
       WHERE s.studentId = ${e}
         AND s.status <> 'DRAFT'
       GROUP BY a.courseId`,a.prisma.$queryRaw`
      SELECT q.courseId,
             COUNT(*) AS taken,
             SUM(COALESCE(t.score, 0)) AS scoreSum,
             SUM(t.maxScore) AS maxSum,
             MAX(CASE WHEN t.maxScore > 0
                      THEN ROUND(COALESCE(t.score, 0) * 100 / t.maxScore)
                      ELSE NULL END) AS bestPercent,
             COALESCE(SUM(t.timeSpentSeconds), 0) AS timeSeconds
        FROM QuizAttempt t
        JOIN Quiz q ON q.id = t.quizId
       WHERE t.studentId = ${e}
         AND t.status IN ('SUBMITTED', 'GRADED')
       GROUP BY q.courseId`,a.prisma.certificate.findMany({where:{userId:e,status:{not:"REVOKED"}},select:{courseId:!0,serialNumber:!0}}),0===h.length?[]:a.prisma.$queryRaw`
          (SELECT m.id, m.title, c.title AS courseTitle, b.name AS batchName,
                  m.scheduledStart, m.roomCode, m.location, 'next' AS side
             FROM Meeting m
             LEFT JOIN Course c ON c.id = m.courseId
             LEFT JOIN Batch b ON b.id = m.batchId
            WHERE m.batchId IN (${n.Prisma.join(h)})
              AND m.status <> 'CANCELLED'
              AND m.scheduledStart >= NOW()
            ORDER BY m.scheduledStart ASC
            LIMIT 1)
          UNION ALL
          (SELECT m.id, m.title, c.title AS courseTitle, b.name AS batchName,
                  m.scheduledStart, m.roomCode, m.location, 'last' AS side
             FROM Meeting m
             LEFT JOIN Course c ON c.id = m.courseId
             LEFT JOIN Batch b ON b.id = m.batchId
            WHERE m.batchId IN (${n.Prisma.join(h)})
              AND m.status <> 'CANCELLED'
              AND m.scheduledStart < NOW()
            ORDER BY m.scheduledStart DESC
            LIMIT 1)`,0===h.length?0:a.prisma.meeting.count({where:{batchId:{in:h},status:{not:"CANCELLED"},scheduledStart:{gte:new Date}}}),(0,i.noteReadingSummary)(e),a.prisma.$queryRaw`
      SELECT COUNT(*) AS \`read\`, SUM(seconds) AS seconds, SUM(downloads) AS downloads
        FROM MaterialRead
       WHERE userId = ${e}`,a.prisma.$queryRaw`
      SELECT COUNT(*) AS registered,
             SUM(CASE WHEN attendedSeconds > 0 OR joinedAt IS NOT NULL THEN 1 ELSE 0 END) AS attended
        FROM WebinarRegistration
       WHERE userId = ${e}`,a.prisma.$queryRaw`
      SELECT COUNT(*) AS invited,
             SUM(CASE WHEN refereeId IS NOT NULL THEN 1 ELSE 0 END) AS joined,
             COALESCE(SUM(CASE WHEN status = 'REWARDED' THEN rewardAmount ELSE 0 END), 0) AS earned
        FROM Referral
       WHERE referrerId = ${e}`,(0,d.getWalletView)(e),(0,s.getStudentFees)(e)]),M=new Map(C.map(e=>[e.courseId,e])),U=new Map(g.map(e=>[e.batchId,e])),y=new Map(R.map(e=>[e.courseId??"",e])),x=new Map(b.map(e=>[e.courseId??"",e])),H=new Map(I.filter(e=>e.courseId).map(e=>[e.courseId,e.serialNumber])),q=p.map(e=>{let t,r,a,n,s,d,i,o,l,u,c,E,S=M.get(e.courseId),p=e.batchId?U.get(e.batchId):void 0,N=y.get(e.courseId),h=x.get(e.courseId),A=(t=p?.held,Number(t??0)),C=(r=p?.attended,Number(r??0));return{enrollmentId:e.id,courseId:e.courseId,courseTitle:e.courseTitle,batchId:e.batchId,batchName:e.batchName,status:e.status,enrolledAt:new Date(e.enrolledAt).toISOString(),completedAt:e.completedAt?new Date(e.completedAt).toISOString():null,progressPercent:Math.round(e.progressPercent),lessonsTotal:(a=S?.total,Number(a??0)),lessonsCompleted:(n=S?.completed,Number(n??0)),watchSeconds:(s=S?.watchSeconds,Number(s??0)),classesHeld:A,classesAttended:C,attendancePercent:m(C,A),assignmentsSubmitted:(d=N?.submitted,Number(d??0)),assignmentsGraded:(i=N?.graded,Number(i??0)),assignmentAvgPercent:m((o=N?.scoreSum,Number(o??0)),(l=N?.maxSum,Number(l??0))),quizzesTaken:(u=h?.taken,Number(u??0)),quizAvgPercent:m((c=h?.scoreSum,Number(c??0)),(E=h?.maxSum,Number(E??0))),quizBestPercent:h?.bestPercent==null?null:Math.round(Number(h.bestPercent)),certificateSerial:H.get(e.courseId)??null}}),F=e=>{let t=O.find(t=>t.side===e);return t?{id:t.id,title:t.title,courseTitle:t.courseTitle,batchName:t.batchName,scheduledStart:new Date(t.scheduledStart).toISOString(),roomCode:t.roomCode,location:t.location}:null},$=g.reduce((e,t)=>{let r;return e+(r=t.held,Number(r??0))},0),W=g.reduce((e,t)=>{let r;return e+(r=t.attended,Number(r??0))},0),_=q.reduce((e,t)=>e+t.lessonsTotal,0),B=q.reduce((e,t)=>e+t.lessonsCompleted,0),k=R.reduce((e,t)=>{let r;return e+(r=t.scoreSum,Number(r??0))},0),z=R.reduce((e,t)=>{let r;return e+(r=t.maxSum,Number(r??0))},0),j=b.reduce((e,t)=>{let r;return e+(r=t.scoreSum,Number(r??0))},0),G=b.reduce((e,t)=>{let r;return e+(r=t.maxSum,Number(r??0))},0),J=b.map(e=>null==e.bestPercent?null:Number(e.bestPercent)).filter(e=>null!=e),K=await a.prisma.assignmentStudent.count({where:{userId:e}}),Y=R.reduce((e,t)=>{let r;return e+(r=t.submitted,Number(r??0))},0);return{courses:q,totals:{enrolled:q.length,completed:q.filter(e=>"COMPLETED"===e.status||e.progressPercent>=100).length,inProgress:q.filter(e=>e.progressPercent>0&&e.progressPercent<100).length,certificates:I.length,lessonsTotal:_,lessonsCompleted:B,watchSeconds:q.reduce((e,t)=>e+t.watchSeconds,0),progressPercent:m(B,_)},attendance:{held:$,attended:W,percent:m(W,$),attendedSeconds:g.reduce((e,t)=>{let r;return e+(r=t.attendedSeconds,Number(r??0))},0),classSeconds:g.reduce((e,t)=>{let r;return e+(r=t.classSeconds,Number(r??0))},0)},classes:{next:F("next"),last:F("last"),pending:w},notes:T,materials:{read:(t=v[0]?.read,Number(t??0)),seconds:(r=v[0]?.seconds,Number(r??0)),downloads:(o=v[0]?.downloads,Number(o??0))},assignments:{submitted:Y,graded:R.reduce((e,t)=>{let r;return e+(r=t.graded,Number(r??0))},0),pending:Math.max(0,K-Y),avgPercent:m(k,z)},quizzes:{taken:b.reduce((e,t)=>{let r;return e+(r=t.taken,Number(r??0))},0),avgPercent:m(j,G),bestPercent:J.length?Math.max(...J):null,timeSeconds:b.reduce((e,t)=>{let r;return e+(r=t.timeSeconds,Number(r??0))},0)},webinars:{registered:(l=L[0]?.registered,Number(l??0)),attended:(u=L[0]?.attended,Number(u??0))},referrals:{invited:(E=P[0]?.invited,Number(E??0)),joined:(S=P[0]?.joined,Number(S??0)),earned:Number(P[0]?.earned??0),walletBalance:f.balance},fees:{billed:D.totalBilled,paid:D.totalPaid,due:D.totalDue,status:D.overallStatus,nextDueDate:D.emi.nextDueDate,nextDueAmount:D.emi.nextDueAmount,emiPending:D.emi.pendingCount}}}async function u(e){let[t,r]=await Promise.all([a.prisma.user.findUniqueOrThrow({where:{id:e},select:{name:!0,email:!0,phone:!0,createdAt:!0}}),l(e)]);return{learner:{name:t.name,email:t.email,phone:t.phone,joinedAt:t.createdAt.toISOString()},card:r}}e.s(["reportCardCsv",0,function(e,t){let r=t.courses.map(t=>[e.name,e.email,e.phone??"",t.courseTitle,t.batchName??"",t.status,t.enrolledAt.slice(0,10),t.lessonsCompleted,t.lessonsTotal,t.progressPercent,t.classesHeld,t.classesAttended,t.attendancePercent??"",t.assignmentsSubmitted,t.assignmentsGraded,t.assignmentAvgPercent??"",t.quizzesTaken,t.quizAvgPercent??"",t.quizBestPercent??"",t.certificateSerial??""]);return{headers:["Student","Email","Phone","Course","Batch","Status","Enrolled on","Lessons completed","Lessons total","Progress %","Classes held","Classes attended","Attendance %","Assignments submitted","Assignments graded","Assignment average %","Quizzes attempted","Quiz average %","Quiz best %","Certificate"],rows:r}},"reportCardFor",0,u]),r()}catch(e){r(e)}},!1),787056,e=>e.a(async(t,r)=>{try{var a=e.i(195341),n=e.i(442656),s=e.i(703551),d=e.i(985902),i=t([n,d]);[n,d]=i.then?(await i)():i;let o=(0,a.withRoute)(async(e,{params:t})=>{await (0,n.requireApiStaff)();let r=String((await t).id),{learner:a,card:i}=await (0,d.reportCardFor)(r),{headers:o,rows:l}=(0,d.reportCardCsv)(a,i),u=a.name.replace(/[^a-z0-9]+/gi,"-").toLowerCase();return(0,s.csvResponse)(`report-card-${u}.csv`,(0,s.toCsv)(o,l))});e.s(["GET",0,o,"dynamic",0,"force-dynamic","runtime",0,"nodejs"]),r()}catch(e){r(e)}},!1),924675,e=>e.a(async(t,r)=>{try{var a=e.i(747909),n=e.i(174017),s=e.i(996250),d=e.i(759756),i=e.i(561916),o=e.i(174677),l=e.i(869741),u=e.i(316795),c=e.i(487718),m=e.i(995169),E=e.i(47587),S=e.i(666012),p=e.i(570101),N=e.i(626937),h=e.i(10372),A=e.i(193695);e.i(820232);var C=e.i(600220),g=e.i(787056),R=t([g]);[g]=R.then?(await R)():R;let I=new a.AppRouteRouteModule({definition:{kind:n.RouteKind.APP_ROUTE,page:"/api/admin/students/[id]/report-card/route",pathname:"/api/admin/students/[id]/report-card",filename:"route",bundlePath:""},distDir:".next-verify",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/admin/students/[id]/report-card/route.ts",nextConfigOutput:"",userland:g,...{}}),{workAsyncStorage:O,workUnitAsyncStorage:w,serverHooks:T}=I;async function b(e,t,r){r.requestMeta&&(0,d.setRequestMeta)(e,r.requestMeta),I.isDev&&(0,d.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let a="/api/admin/students/[id]/report-card/route";a=a.replace(/\/index$/,"")||"/";let s=await I.prepare(e,t,{srcPage:a,multiZoneDraftMode:!1});if(!s)return t.statusCode=400,t.end("Bad Request"),null==r.waitUntil||r.waitUntil.call(r,Promise.resolve()),null;let{buildId:g,deploymentId:R,params:b,nextConfig:O,parsedUrl:w,isDraftMode:T,prerenderManifest:v,routerServerContext:L,isOnDemandRevalidate:P,revalidateOnlyGenerated:f,resolvedPathname:D,clientReferenceManifest:M,serverActionsManifest:U}=s,y=(0,l.normalizeAppPath)(a),x=!!(v.dynamicRoutes[y]||v.routes[D]),H=async()=>((null==L?void 0:L.render404)?await L.render404(e,t,w,!1):t.end("This page could not be found"),null);if(x&&!T){let e=!!v.routes[D],t=v.dynamicRoutes[y];if(t&&!1===t.fallback&&!e){if(O.adapterPath)return await H();throw new A.NoFallbackError}}let q=null;!x||I.isDev||T||(q=D,q="/index"===q?"/":q);let F=!0===I.isDev||!x,$=x&&!F;U&&M&&(0,o.setManifestsSingleton)({page:a,clientReferenceManifest:M,serverActionsManifest:U});let W=e.method||"GET",_=(0,i.getTracer)(),B=_.getActiveScopeSpan(),k=!!(null==L?void 0:L.isWrappedByNextServer),z=!!(0,d.getRequestMeta)(e,"minimalMode"),j=(0,d.getRequestMeta)(e,"incrementalCache")||await I.getIncrementalCache(e,O,v,z);null==j||j.resetRequestCache(),globalThis.__incrementalCache=j;let G={params:b,previewProps:v.preview,renderOpts:{experimental:{authInterrupts:!!O.experimental.authInterrupts},cacheComponents:!!O.cacheComponents,supportsDynamicResponse:F,incrementalCache:j,cacheLifeProfiles:O.cacheLife,waitUntil:r.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>I.onRequestError(e,t,a,n,L)},sharedContext:{buildId:g,deploymentId:R}},J=new u.NodeNextRequest(e),K=new u.NodeNextResponse(t),Y=c.NextRequestAdapter.fromNodeNextRequest(J,(0,c.signalFromNodeResponse)(t));try{let s,d=async e=>I.handle(Y,G).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=_.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${W} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t),s&&s!==e&&(s.setAttribute("http.route",n),s.updateName(t))}else e.updateName(`${W} ${a}`)}),o=async s=>{var i,o;let l=async({previousCacheEntry:n})=>{try{if(!z&&P&&f&&!n)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let a=await d(s);e.fetchMetrics=G.renderOpts.fetchMetrics;let i=G.renderOpts.pendingWaitUntil;i&&r.waitUntil&&(r.waitUntil(i),i=void 0);let o=G.renderOpts.collectedTags;if(!x)return await (0,S.sendResponse)(J,K,a,G.renderOpts.pendingWaitUntil),null;{let e=await a.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(a.headers);o&&(t[h.NEXT_CACHE_TAGS_HEADER]=o),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==G.renderOpts.collectedRevalidate&&!(G.renderOpts.collectedRevalidate>=h.INFINITE_CACHE)&&G.renderOpts.collectedRevalidate,n=void 0===G.renderOpts.collectedExpire||G.renderOpts.collectedExpire>=h.INFINITE_CACHE?void 0:G.renderOpts.collectedExpire;return{value:{kind:C.CachedRouteKind.APP_ROUTE,status:a.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==n?void 0:n.isStale)&&await I.onRequestError(e,t,{routerKind:"App Router",routePath:a,routeType:"route",revalidateReason:(0,E.getRevalidateReason)({isStaticGeneration:$,isOnDemandRevalidate:P})},!1,L),t}},u=await I.handleResponse({req:e,nextConfig:O,cacheKey:q,routeKind:n.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:v,isRoutePPREnabled:!1,isOnDemandRevalidate:P,revalidateOnlyGenerated:f,responseGenerator:l,waitUntil:r.waitUntil,isMinimalMode:z});if(!x)return null;if((null==u||null==(i=u.value)?void 0:i.kind)!==C.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==u||null==(o=u.value)?void 0:o.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});z||t.setHeader("x-nextjs-cache",P?"REVALIDATED":u.isMiss?"MISS":u.isStale?"STALE":"HIT"),T&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let c=(0,p.fromNodeOutgoingHttpHeaders)(u.value.headers);return z&&x||c.delete(h.NEXT_CACHE_TAGS_HEADER),!u.cacheControl||t.getHeader("Cache-Control")||c.get("Cache-Control")||c.set("Cache-Control",(0,N.getCacheControlHeader)(u.cacheControl)),await (0,S.sendResponse)(J,K,new Response(u.value.body,{headers:c,status:u.value.status||200})),null};k&&B?await o(B):(s=_.getActiveScopeSpan(),await _.withPropagatedContext(e.headers,()=>_.trace(m.BaseServerSpan.handleRequest,{spanName:`${W} ${a}`,kind:i.SpanKind.SERVER,attributes:{"http.method":W,"http.target":e.url}},o),void 0,!k))}catch(t){if(t instanceof A.NoFallbackError||await I.onRequestError(e,t,{routerKind:"App Router",routePath:y,routeType:"route",revalidateReason:(0,E.getRevalidateReason)({isStaticGeneration:$,isOnDemandRevalidate:P})},!1,L),x)throw t;return await (0,S.sendResponse)(J,K,new Response(null,{status:500})),null}}e.s(["handler",0,b,"patchFetch",0,function(){return(0,s.patchFetch)({workAsyncStorage:O,workUnitAsyncStorage:w})},"routeModule",0,I,"serverHooks",0,T,"workAsyncStorage",0,O,"workUnitAsyncStorage",0,w]),r()}catch(e){r(e)}},!1)];

//# sourceMappingURL=_09bl20-._.js.map