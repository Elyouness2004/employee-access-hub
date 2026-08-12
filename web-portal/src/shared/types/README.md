# DTO types

**These are transcriptions, not the intended source.** FRONTEND-ARCHITECTURE §1 says DTO types
are generated from each service's `/v3/api-docs` (`npm run generate:api`, ports 9001–9005), never
hand-written. That script exists and works — but generation needs the services running, and
Docker is unusable on this machine, so nothing can be generated here.

The interim rule, so the drift stays visible and bounded:

- **One place.** Every feature imports these; no feature re-declares a backend shape.
- **Transcribed from the Java records**, with the source file named on each type. When the code
  and these disagree, the Java record wins — check it.
- **Backend names kept verbatim** (`EmployeeProfileResponse`, `businessDays`, `hrEscalated`), so a
  generated file can replace this one without touching a consumer.
- **Nothing invented.** A field that is not on the record is not here, even where the UI would
  find it convenient.

Replace with `src/shared/types/generated/<service>.ts` the moment a backend can be reached, and
delete these files in the same change.
