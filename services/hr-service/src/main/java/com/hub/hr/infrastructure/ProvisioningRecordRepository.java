package com.hub.hr.infrastructure;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProvisioningRecordRepository extends JpaRepository<ProvisioningRecord, UUID> {

    List<ProvisioningRecord> findAllByEmployeeIdOrderByOccurredAtAsc(UUID employeeId);

    List<ProvisioningRecord> findTop100ByOrderByOccurredAtDesc();
}
