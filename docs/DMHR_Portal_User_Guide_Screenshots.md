# DM.HR Portal User Guide — Screenshot capture checklist

Use with `DMHR_Portal_User_Guide.md` and `build_user_guide_docx.py`.

Assets folder: `docs/user-guide-assets/`

## Capture settings

- URL: https://portal.dmhrgroup.com  
- Desktop ~1280–1440px wide, browser zoom 100%  
- Prefer light theme for print  
- Use test organisation / test data; blur real PII if needed  
- Include sidebar + main content (not the whole OS desktop)

## Status legend

- [ ] Not captured  
- [x] Captured & inserted in Doc  

---

## Shared

| Done | ID | Screen | Notes |
|------|-----|--------|--------|
| [x] | 02-login | Login page | Full page, logo visible |
| [x] | 03-shell | Shell | Sidebar + workspace |

## Admin

| Done | ID | Screen | Notes |
|------|-----|--------|--------|
| [x] | A01-admin-overview | Overview | Metrics + attention lists |
| [x] | A02-orgs-list | Organisations list | |
| [x] | A03-add-org | Add organisation | Form open |
| [x] | A04-org-detail | Organisation detail | |
| [x] | A05-users-list | Users list | |
| [x] | A06-add-user | Add user | Org selected |
| [x] | A07-employees | Employees list | |
| [x] | A08-add-employee | Add employee | |
| [x] | A09-cases-list | Cases list | |
| [x] | A10-create-case | Create case | |
| [x] | A11-case-detail | Case detail | Thread visible |
| [x] | A12-documents | Documents | Client selected |
| [x] | A13-firm-library | Firm Library | |
| [x] | A14-signatures | Signatures list | |
| [x] | A15-esign-sheet | E-sign builder | After placing a field |
| [x] | A20-request-signature-docs | Documents Request signature | PDF row icons |
| [x] | A21-esign-place-fields | Place fields rail | Signature / Initials / Text / Date |
| [x] | A22-esign-cc | CC notify only | CC panel open |
| [x] | A16-onboarding-list | Onboarding list | |
| [x] | A17-onboarding-detail | Onboarding detail | Stages + pack |
| [x] | A18-settings | Settings | |
| [x] | A19-notifications | Notifications | |

## Client

| Done | ID | Screen | Notes |
|------|-----|--------|--------|
| [x] | C01-client-overview | Overview | |
| [x] | C02-onboarding | Onboarding | |
| [x] | C03-documents | Documents | Also `C04-documents.png` |
| [ ] | C04-doc-preview | Document preview | Covered inside C06 sign UI |
| [x] | C12-signatures | Signatures | Saved signatures + list |
| [x] | C06-sign-ui | Signing screen | Fill boxes / Finish my part |
| [x] | C07-cases | Cases list | |
| [x] | C08-submit-case | Submit case | |
| [x] | C09-case-thread | Case thread | Updates & timeline |
| [x] | C10-employees | Employees | |
| [x] | C11-company-users | Company Users | |
| [x] | C13-settings | Settings | Account tab |

## Export path

1. Capture required rows (optional rows can stay empty)  
2. Run `python docs/build_user_guide_docx.py`  
3. Output: `docs/DMHR_Portal_User_Guide.docx`  
4. Share Word/PDF with Dave as needed  
