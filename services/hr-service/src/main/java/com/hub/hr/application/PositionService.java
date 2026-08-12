package com.hub.hr.application;

import java.util.UUID;

import com.hub.hr.api.dto.PageResponse;
import com.hub.hr.api.dto.PositionRequest;
import com.hub.hr.api.dto.PositionResponse;
import com.hub.hr.domain.Position;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.PositionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PositionService {

    private final PositionRepository positions;
    private final EmployeeRepository employees;

    public PositionService(PositionRepository positions, EmployeeRepository employees) {
        this.positions = positions;
        this.employees = employees;
    }

    /** Catalogue page; {@code search} matches the title or the description (blank = no filter). */
    @Transactional(readOnly = true)
    public PageResponse<PositionResponse> page(String search, Pageable pageable) {
        String term = Filters.blankToNull(search);
        Page<Position> page = term == null
                ? positions.findAll(pageable)
                : positions.findAllByTitleContainingIgnoreCaseOrDescriptionContainingIgnoreCase(
                        term, term, pageable);
        return PageResponse.from(page, PositionResponse::from);
    }

    @Transactional(readOnly = true)
    public PositionResponse get(UUID id) {
        return PositionResponse.from(require(id));
    }

    public PositionResponse create(PositionRequest request) {
        if (positions.existsByTitleIgnoreCase(request.title())) {
            throw new DuplicateResourceException("position title already exists: " + request.title());
        }
        Position position = new Position();
        apply(position, request);
        return PositionResponse.from(positions.save(position));
    }

    public PositionResponse update(UUID id, PositionRequest request) {
        Position position = require(id);
        if (positions.existsByTitleIgnoreCaseAndIdNot(request.title(), id)) {
            throw new DuplicateResourceException("position title already exists: " + request.title());
        }
        apply(position, request);
        return PositionResponse.from(positions.save(position));
    }

    public void delete(UUID id) {
        Position position = require(id);
        if (employees.existsByPositionId(id)) {
            throw new ResourceInUseException("position still has employees assigned: " + id);
        }
        positions.delete(position);
    }

    private Position require(UUID id) {
        return positions.findById(id).orElseThrow(() -> new ResourceNotFoundException("position", id));
    }

    private void apply(Position position, PositionRequest request) {
        position.setTitle(request.title());
        position.setDescription(request.description());
    }
}
