package com.hub.hr.infrastructure;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UserAgentParserTest {

    @Test
    void classifiesChromeOnWindowsDesktop() {
        UserAgentParser.Parsed parsed = UserAgentParser.parse(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                        + "Chrome/125.0 Safari/537.36");
        assertThat(parsed.browser()).isEqualTo("Chrome");
        assertThat(parsed.operatingSystem()).isEqualTo("Windows");
        assertThat(parsed.device()).isEqualTo("Desktop");
    }

    @Test
    void edgeIsNotMisreadAsChrome() {
        UserAgentParser.Parsed parsed = UserAgentParser.parse(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                        + "Chrome/125.0 Safari/537.36 Edg/125.0");
        assertThat(parsed.browser()).isEqualTo("Edge");
    }

    @Test
    void classifiesSafariOnIphone() {
        UserAgentParser.Parsed parsed = UserAgentParser.parse(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
                        + "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1");
        assertThat(parsed.browser()).isEqualTo("Safari");
        assertThat(parsed.operatingSystem()).isEqualTo("iOS");
        assertThat(parsed.device()).isEqualTo("iPhone");
    }

    @Test
    void classifiesFirefoxAndroidPhone() {
        UserAgentParser.Parsed parsed = UserAgentParser.parse(
                "Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0");
        assertThat(parsed.browser()).isEqualTo("Firefox");
        assertThat(parsed.operatingSystem()).isEqualTo("Android");
        assertThat(parsed.device()).isEqualTo("Android phone");
    }

    @Test
    void blankOrNullUserAgentYieldsNulls() {
        UserAgentParser.Parsed empty = UserAgentParser.parse("   ");
        assertThat(empty.browser()).isNull();
        assertThat(empty.operatingSystem()).isNull();
        assertThat(empty.device()).isNull();

        UserAgentParser.Parsed none = UserAgentParser.parse(null);
        assertThat(none.browser()).isNull();
        assertThat(none.operatingSystem()).isNull();
        assertThat(none.device()).isNull();
    }
}
