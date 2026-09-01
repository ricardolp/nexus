package httpapi

import "testing"

func TestLoginAfterPassword(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name            string
		mfaEnabled      bool
		trustedDevice   bool
		orgRequiresMFA  bool
		want            loginStep
	}{
		{
			name: "enrolled user on unknown browser is challenged",
			mfaEnabled: true, trustedDevice: false, orgRequiresMFA: false,
			want: loginStepMFAChallenge,
		},
		{
			name: "trusted device after MFA skips challenge on next login",
			mfaEnabled: true, trustedDevice: true, orgRequiresMFA: true,
			want: loginStepSession,
		},
		{
			name: "org requires MFA and user has not enrolled",
			mfaEnabled: false, trustedDevice: false, orgRequiresMFA: true,
			want: loginStepMFASetup,
		},
		{
			name: "no MFA at all",
			mfaEnabled: false, trustedDevice: false, orgRequiresMFA: false,
			want: loginStepSession,
		},
		{
			name: "logout must not force setup for an already enrolled user",
			mfaEnabled: true, trustedDevice: true, orgRequiresMFA: false,
			want: loginStepSession,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := loginAfterPassword(tc.mfaEnabled, tc.trustedDevice, tc.orgRequiresMFA)
			if got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}
