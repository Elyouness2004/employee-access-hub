package com.hub.hr.api.dto;

/** Result of terminating every other session: how many were ended (Part 8). */
public record LogoutOthersResponse(int terminated) {
}
