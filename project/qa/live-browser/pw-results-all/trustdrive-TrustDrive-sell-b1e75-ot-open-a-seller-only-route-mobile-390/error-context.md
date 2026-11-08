# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trustdrive.spec.ts >> TrustDrive seller -> buyer, 21 persisted steps >> RBAC: a buyer cannot open a seller-only route
- Location: e2e\trustdrive.spec.ts:152:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic [ref=f2e2]:
    - link "Skip to content" [ref=f2e3]:
      - /url: "#portal-main"
    - navigation "Primary navigation" [ref=f2e4]:
      - link "Overview" [ref=f2e5]:
        - /url: /seller
      - link "Vehicles" [ref=f2e12]:
        - /url: /seller/vehicles
      - link "Add" [ref=f2e18]:
        - /url: /seller/add-vehicle
      - link "Documents" [ref=f2e22]:
        - /url: /seller/documents
      - link "History" [ref=f2e26]:
        - /url: /seller/history
    - generic [ref=f2e32]:
      - banner [ref=f2e33]:
        - link "TrustDrive home" [ref=f2e34]:
          - /url: /
          - generic [ref=f2e37]: TRUSTDRIVE
        - generic [ref=f2e39]:
          - generic [ref=f2e40]:
            - generic [ref=f2e41]: TrustDrive
            - generic [ref=f2e42]: /
            - generic [ref=f2e43]: seller workspace
          - heading "TrustDrive — My Vehicles" [level=1] [ref=f2e44]
        - generic [ref=f2e45]:
          - button "Switch to Night mode" [ref=f2e46] [cursor=pointer]
          - link "Notifications, 61 unread" [ref=f2e59]:
            - /url: /seller/notifications
            - generic [ref=f2e63]: 9+
          - group [ref=f2e64]:
            - generic "SD" [ref=f2e65] [cursor=pointer]
      - main [ref=f2e69]:
        - generic [ref=f2e71]:
          - generic [ref=f2e72]:
            - generic [ref=f2e73]:
              - paragraph [ref=f2e74]: Garage
              - heading "My Vehicles" [level=1] [ref=f2e75]
              - paragraph [ref=f2e76]: 24 vehicles registered. Each record carries its own evidence, verification history and listing state.
            - link "Add vehicle" [ref=f2e78] [cursor=pointer]:
              - /url: /seller/add-vehicle
          - generic [ref=f2e80]:
            - generic [ref=f2e81]:
              - generic [ref=f2e82]:
                - generic [ref=f2e83]: Vehicles
                - generic [ref=f2e90]: "24"
                - generic [ref=f2e92]: In your garage
              - generic [ref=f2e93]:
                - generic [ref=f2e94]: Published
                - generic [ref=f2e101]: "6"
                - generic [ref=f2e103]: Visible to buyers
              - generic [ref=f2e104]:
                - generic [ref=f2e105]: Need attention
                - generic [ref=f2e110]: "21"
                - generic [ref=f2e112]: Open findings or low coverage
              - generic [ref=f2e113]:
                - generic [ref=f2e114]: Photos
                - generic [ref=f2e122]: "31"
                - generic [ref=f2e124]: Across all vehicles
            - generic [ref=f2e126]:
              - generic [ref=f2e127]:
                - textbox "Search vehicles" [ref=f2e132]:
                  - /placeholder: Search by reg no, VIN, make or model…
                - combobox "Filter by status" [ref=f2e133]:
                  - option "All statuses" [selected]
                  - option "Published"
                  - option "Draft"
                  - option "Paused"
                  - option "Sold"
                  - option "Archived"
                - generic [ref=f2e134]: 24 shown
              - table [ref=f2e136]:
                - rowgroup [ref=f2e137]:
                  - row [ref=f2e138]:
                    - columnheader "Vehicle" [ref=f2e139]
                    - columnheader "Mileage" [ref=f2e140]
                    - columnheader "Price" [ref=f2e141]
                    - columnheader "Coverage" [ref=f2e142]
                    - columnheader "Trust" [ref=f2e143]
                    - columnheader "Listing" [ref=f2e144]
                    - columnheader "Actions" [ref=f2e145]
                - rowgroup [ref=f2e146]:
                  - row [ref=f2e147]:
                    - cell "Honda City ZX Standard 2023 · MH02E2E9185 · Petrol 0 photos" [ref=f2e148]:
                      - generic [ref=f2e155]:
                        - generic [ref=f2e156]: Honda City ZX Standard
                        - generic [ref=f2e157]: 2023 · MH02E2E9185 · Petrol
                        - generic [ref=f2e158]: 0 photos
                    - cell "18,500 km" [ref=f2e159]
                    - cell "₹ 12,50,000" [ref=f2e160]
                    - cell "0%" [ref=f2e161]
                    - cell "0/100" [ref=f2e163]
                    - cell "Draft" [ref=f2e165]
                    - cell [ref=f2e170]:
                      - generic [ref=f2e171]:
                        - link "View vehicle" [ref=f2e172]:
                          - /url: /seller/vehicles/v-1793887106524
                        - link "History" [ref=f2e176]:
                          - /url: /seller/history?vehicle=v-1793887106524
                        - link "Documents" [ref=f2e181]:
                          - /url: /seller/documents?vehicle=v-1793887106524
                        - link "Listing" [ref=f2e184]:
                          - /url: /seller/listings?vehicle=v-1793887106524
                        - button "Archive vehicle" [ref=f2e189] [cursor=pointer]
                  - row [ref=f2e193]:
                    - cell "Honda City ZX Standard 2023 · MH02E2E9150 · Petrol 0 photos" [ref=f2e194]:
                      - generic [ref=f2e201]:
                        - generic [ref=f2e202]: Honda City ZX Standard
                        - generic [ref=f2e203]: 2023 · MH02E2E9150 · Petrol
                        - generic [ref=f2e204]: 0 photos
                    - cell "18,500 km" [ref=f2e205]
                    - cell "₹ 12,50,000" [ref=f2e206]
                    - cell "0%" [ref=f2e207]
                    - cell "0/100" [ref=f2e209]
                    - cell "Draft" [ref=f2e211]
                    - cell [ref=f2e216]:
                      - generic [ref=f2e217]:
                        - link "View vehicle" [ref=f2e218]:
                          - /url: /seller/vehicles/v-1793886266814
                        - link "History" [ref=f2e222]:
                          - /url: /seller/history?vehicle=v-1793886266814
                        - link "Documents" [ref=f2e227]:
                          - /url: /seller/documents?vehicle=v-1793886266814
                        - link "Listing" [ref=f2e230]:
                          - /url: /seller/listings?vehicle=v-1793886266814
                        - button "Archive vehicle" [ref=f2e235] [cursor=pointer]
                  - row [ref=f2e239]:
                    - cell "Honda City ZX CVT 2022 · DL01AB6585 · Petrol 3 photos" [ref=f2e240]:
                      - generic [ref=f2e247]:
                        - generic [ref=f2e248]: Honda City ZX CVT
                        - generic [ref=f2e249]: 2022 · DL01AB6585 · Petrol
                        - generic [ref=f2e250]: 3 photos
                    - cell "25,000 km" [ref=f2e251]
                    - cell "₹ 11,50,000" [ref=f2e252]
                    - cell "30%" [ref=f2e253]
                    - cell "30/100" [ref=f2e255]
                    - cell "Sold" [ref=f2e257]
                    - cell [ref=f2e262]:
                      - generic [ref=f2e263]:
                        - link "View vehicle" [ref=f2e264]:
                          - /url: /seller/vehicles/v-1793885304387
                        - link "History" [ref=f2e268]:
                          - /url: /seller/history?vehicle=v-1793885304387
                        - link "Documents" [ref=f2e273]:
                          - /url: /seller/documents?vehicle=v-1793885304387
                        - link "Listing" [ref=f2e276]:
                          - /url: /seller/listings?vehicle=v-1793885304387
                        - button "Archive vehicle" [ref=f2e281] [cursor=pointer]
                  - row [ref=f2e285]:
                    - cell "Honda City ZX CVT 2022 · DL01AB1379 · Petrol 3 photos" [ref=f2e286]:
                      - generic [ref=f2e293]:
                        - generic [ref=f2e294]: Honda City ZX CVT
                        - generic [ref=f2e295]: 2022 · DL01AB1379 · Petrol
                        - generic [ref=f2e296]: 3 photos
                    - cell "25,000 km" [ref=f2e297]
                    - cell "₹ 11,50,000" [ref=f2e298]
                    - cell "30%" [ref=f2e299]
                    - cell "30/100" [ref=f2e301]
                    - cell "Sold" [ref=f2e303]
                    - cell [ref=f2e308]:
                      - generic [ref=f2e309]:
                        - link "View vehicle" [ref=f2e310]:
                          - /url: /seller/vehicles/v-1793884724861
                        - link "History" [ref=f2e314]:
                          - /url: /seller/history?vehicle=v-1793884724861
                        - link "Documents" [ref=f2e319]:
                          - /url: /seller/documents?vehicle=v-1793884724861
                        - link "Listing" [ref=f2e322]:
                          - /url: /seller/listings?vehicle=v-1793884724861
                        - button "Archive vehicle" [ref=f2e327] [cursor=pointer]
                  - row [ref=f2e331]:
                    - cell "Honda City ZX Standard 2023 · MH02E2E2360 · Petrol 0 photos" [ref=f2e332]:
                      - generic [ref=f2e339]:
                        - generic [ref=f2e340]: Honda City ZX Standard
                        - generic [ref=f2e341]: 2023 · MH02E2E2360 · Petrol
                        - generic [ref=f2e342]: 0 photos
                    - cell "18,500 km" [ref=f2e343]
                    - cell "₹ 12,50,000" [ref=f2e344]
                    - cell "0%" [ref=f2e345]
                    - cell "0/100" [ref=f2e347]
                    - cell "Draft" [ref=f2e349]
                    - cell [ref=f2e354]:
                      - generic [ref=f2e355]:
                        - link "View vehicle" [ref=f2e356]:
                          - /url: /seller/vehicles/v-1793883784998
                        - link "History" [ref=f2e360]:
                          - /url: /seller/history?vehicle=v-1793883784998
                        - link "Documents" [ref=f2e365]:
                          - /url: /seller/documents?vehicle=v-1793883784998
                        - link "Listing" [ref=f2e368]:
                          - /url: /seller/listings?vehicle=v-1793883784998
                        - button "Archive vehicle" [ref=f2e373] [cursor=pointer]
                  - row [ref=f2e377]:
                    - cell "QA KpiProbe 2020 · MH02QA1924 · Petrol 0 photos" [ref=f2e378]:
                      - generic [ref=f2e385]:
                        - generic [ref=f2e386]: QA KpiProbe
                        - generic [ref=f2e387]: 2020 · MH02QA1924 · Petrol
                        - generic [ref=f2e388]: 0 photos
                    - cell "10,000 km" [ref=f2e389]
                    - cell "₹ 5,00,000" [ref=f2e390]
                    - cell "0%" [ref=f2e391]
                    - cell "0/100" [ref=f2e393]
                    - cell "Draft" [ref=f2e395]
                    - cell [ref=f2e400]:
                      - generic [ref=f2e401]:
                        - link "View vehicle" [ref=f2e402]:
                          - /url: /seller/vehicles/v-1793883128218
                        - link "History" [ref=f2e406]:
                          - /url: /seller/history?vehicle=v-1793883128218
                        - link "Documents" [ref=f2e411]:
                          - /url: /seller/documents?vehicle=v-1793883128218
                        - link "Listing" [ref=f2e414]:
                          - /url: /seller/listings?vehicle=v-1793883128218
                        - button "Archive vehicle" [disabled] [ref=f2e419]
                  - row [ref=f2e423]:
                    - cell "Tata Nexon XZ+ 2020 · MH20EF1122 · Diesel 0 photos" [ref=f2e424]:
                      - generic [ref=f2e431]:
                        - generic [ref=f2e432]: Tata Nexon XZ+
                        - generic [ref=f2e433]: 2020 · MH20EF1122 · Diesel
                        - generic [ref=f2e434]: 0 photos
                    - cell "32,000 km" [ref=f2e435]
                    - cell "₹ 8,50,000" [ref=f2e436]
                    - cell "20% 2 finding(s)" [ref=f2e437]:
                      - generic [ref=f2e438]: 20%
                      - generic [ref=f2e439]: 2 finding(s)
                    - cell "0/100" [ref=f2e440]
                    - cell "Draft" [ref=f2e442]
                    - cell [ref=f2e447]:
                      - generic [ref=f2e448]:
                        - link "View vehicle" [ref=f2e449]:
                          - /url: /seller/vehicles/v-tata
                        - link "History" [ref=f2e453]:
                          - /url: /seller/history?vehicle=v-tata
                        - link "Documents" [ref=f2e458]:
                          - /url: /seller/documents?vehicle=v-tata
                        - link "Listing" [ref=f2e461]:
                          - /url: /seller/listings?vehicle=v-tata
                        - button "Archive vehicle" [ref=f2e466] [cursor=pointer]
                  - row [ref=f2e470]:
                    - cell "Honda City ZX CVT 2022 · DL01AB1942 · Petrol 3 photos" [ref=f2e471]:
                      - generic [ref=f2e478]:
                        - generic [ref=f2e479]: Honda City ZX CVT
                        - generic [ref=f2e480]: 2022 · DL01AB1942 · Petrol
                        - generic [ref=f2e481]: 3 photos
                    - cell "25,000 km" [ref=f2e482]
                    - cell "₹ 11,50,000" [ref=f2e483]
                    - cell "30%" [ref=f2e484]
                    - cell "30/100" [ref=f2e486]
                    - cell "Sold" [ref=f2e488]
                    - cell [ref=f2e493]:
                      - generic [ref=f2e494]:
                        - link "View vehicle" [ref=f2e495]:
                          - /url: /seller/vehicles/v-1793880568971
                        - link "History" [ref=f2e499]:
                          - /url: /seller/history?vehicle=v-1793880568971
                        - link "Documents" [ref=f2e504]:
                          - /url: /seller/documents?vehicle=v-1793880568971
                        - link "Listing" [ref=f2e507]:
                          - /url: /seller/listings?vehicle=v-1793880568971
                        - button "Archive vehicle" [ref=f2e512] [cursor=pointer]
                  - row [ref=f2e516]:
                    - cell "Honda City ZX CVT 2022 · DL01AB4574 · Petrol 3 photos" [ref=f2e517]:
                      - generic [ref=f2e524]:
                        - generic [ref=f2e525]: Honda City ZX CVT
                        - generic [ref=f2e526]: 2022 · DL01AB4574 · Petrol
                        - generic [ref=f2e527]: 3 photos
                    - cell "25,000 km" [ref=f2e528]
                    - cell "₹ 11,50,000" [ref=f2e529]
                    - cell "30%" [ref=f2e530]
                    - cell "30/100" [ref=f2e532]
                    - cell "Sold" [ref=f2e534]
                    - cell [ref=f2e539]:
                      - generic [ref=f2e540]:
                        - link "View vehicle" [ref=f2e541]:
                          - /url: /seller/vehicles/v-1793877938390
                        - link "History" [ref=f2e545]:
                          - /url: /seller/history?vehicle=v-1793877938390
                        - link "Documents" [ref=f2e550]:
                          - /url: /seller/documents?vehicle=v-1793877938390
                        - link "Listing" [ref=f2e553]:
                          - /url: /seller/listings?vehicle=v-1793877938390
                        - button "Archive vehicle" [ref=f2e558] [cursor=pointer]
                  - row [ref=f2e562]:
                    - cell "Honda City ZX CVT 2022 · DL01AB6629 · Petrol 3 photos" [ref=f2e563]:
                      - generic [ref=f2e570]:
                        - generic [ref=f2e571]: Honda City ZX CVT
                        - generic [ref=f2e572]: 2022 · DL01AB6629 · Petrol
                        - generic [ref=f2e573]: 3 photos
                    - cell "25,000 km" [ref=f2e574]
                    - cell "₹ 11,50,000" [ref=f2e575]
                    - cell "30%" [ref=f2e576]
                    - cell "30/100" [ref=f2e578]
                    - cell "Sold" [ref=f2e580]
                    - cell [ref=f2e585]:
                      - generic [ref=f2e586]:
                        - link "View vehicle" [ref=f2e587]:
                          - /url: /seller/vehicles/v-1793877808674
                        - link "History" [ref=f2e591]:
                          - /url: /seller/history?vehicle=v-1793877808674
                        - link "Documents" [ref=f2e596]:
                          - /url: /seller/documents?vehicle=v-1793877808674
                        - link "Listing" [ref=f2e599]:
                          - /url: /seller/listings?vehicle=v-1793877808674
                        - button "Archive vehicle" [ref=f2e604] [cursor=pointer]
                  - row [ref=f2e608]:
                    - cell "Honda City ZX CVT 2022 · DL01AB1604 · Petrol 3 photos" [ref=f2e609]:
                      - generic [ref=f2e616]:
                        - generic [ref=f2e617]: Honda City ZX CVT
                        - generic [ref=f2e618]: 2022 · DL01AB1604 · Petrol
                        - generic [ref=f2e619]: 3 photos
                    - cell "25,000 km" [ref=f2e620]
                    - cell "₹ 11,50,000" [ref=f2e621]
                    - cell "30%" [ref=f2e622]
                    - cell "30/100" [ref=f2e624]
                    - cell "Sold" [ref=f2e626]
                    - cell [ref=f2e631]:
                      - generic [ref=f2e632]:
                        - link "View vehicle" [ref=f2e633]:
                          - /url: /seller/vehicles/v-1793877460828
                        - link "History" [ref=f2e637]:
                          - /url: /seller/history?vehicle=v-1793877460828
                        - link "Documents" [ref=f2e642]:
                          - /url: /seller/documents?vehicle=v-1793877460828
                        - link "Listing" [ref=f2e645]:
                          - /url: /seller/listings?vehicle=v-1793877460828
                        - button "Archive vehicle" [ref=f2e650] [cursor=pointer]
                  - row [ref=f2e654]:
                    - cell "Honda City ZX CVT 2022 · DL01AB8435 · Petrol 3 photos" [ref=f2e655]:
                      - generic [ref=f2e662]:
                        - generic [ref=f2e663]: Honda City ZX CVT
                        - generic [ref=f2e664]: 2022 · DL01AB8435 · Petrol
                        - generic [ref=f2e665]: 3 photos
                    - cell "25,000 km" [ref=f2e666]
                    - cell "₹ 11,50,000" [ref=f2e667]
                    - cell "30%" [ref=f2e668]
                    - cell "30/100" [ref=f2e670]
                    - cell "Sold" [ref=f2e672]
                    - cell [ref=f2e677]:
                      - generic [ref=f2e678]:
                        - link "View vehicle" [ref=f2e679]:
                          - /url: /seller/vehicles/v-1793877426535
                        - link "History" [ref=f2e683]:
                          - /url: /seller/history?vehicle=v-1793877426535
                        - link "Documents" [ref=f2e688]:
                          - /url: /seller/documents?vehicle=v-1793877426535
                        - link "Listing" [ref=f2e691]:
                          - /url: /seller/listings?vehicle=v-1793877426535
                        - button "Archive vehicle" [ref=f2e696] [cursor=pointer]
                  - row [ref=f2e700]:
                    - cell "Honda City ZX CVT 2022 · DL01AB4547 · Petrol 3 photos" [ref=f2e701]:
                      - generic [ref=f2e708]:
                        - generic [ref=f2e709]: Honda City ZX CVT
                        - generic [ref=f2e710]: 2022 · DL01AB4547 · Petrol
                        - generic [ref=f2e711]: 3 photos
                    - cell "25,000 km" [ref=f2e712]
                    - cell "₹ 11,50,000" [ref=f2e713]
                    - cell "30%" [ref=f2e714]
                    - cell "30/100" [ref=f2e716]
                    - cell "Sold" [ref=f2e718]
                    - cell [ref=f2e723]:
                      - generic [ref=f2e724]:
                        - link "View vehicle" [ref=f2e725]:
                          - /url: /seller/vehicles/v-1793877080564
                        - link "History" [ref=f2e729]:
                          - /url: /seller/history?vehicle=v-1793877080564
                        - link "Documents" [ref=f2e734]:
                          - /url: /seller/documents?vehicle=v-1793877080564
                        - link "Listing" [ref=f2e737]:
                          - /url: /seller/listings?vehicle=v-1793877080564
                        - button "Archive vehicle" [ref=f2e742] [cursor=pointer]
                  - row [ref=f2e746]:
                    - cell "Honda City ZX CVT 2022 · DL01AB3597 · Petrol 3 photos" [ref=f2e747]:
                      - generic [ref=f2e754]:
                        - generic [ref=f2e755]: Honda City ZX CVT
                        - generic [ref=f2e756]: 2022 · DL01AB3597 · Petrol
                        - generic [ref=f2e757]: 3 photos
                    - cell "25,000 km" [ref=f2e758]
                    - cell "₹ 11,50,000" [ref=f2e759]
                    - cell "30% 1 finding(s)" [ref=f2e760]:
                      - generic [ref=f2e761]: 30%
                      - generic [ref=f2e762]: 1 finding(s)
                    - cell "0/100" [ref=f2e763]
                    - cell "Sold" [ref=f2e765]
                    - cell [ref=f2e770]:
                      - generic [ref=f2e771]:
                        - link "View vehicle" [ref=f2e772]:
                          - /url: /seller/vehicles/v-1793876952456
                        - link "History" [ref=f2e776]:
                          - /url: /seller/history?vehicle=v-1793876952456
                        - link "Documents" [ref=f2e781]:
                          - /url: /seller/documents?vehicle=v-1793876952456
                        - link "Listing" [ref=f2e784]:
                          - /url: /seller/listings?vehicle=v-1793876952456
                        - button "Archive vehicle" [ref=f2e789] [cursor=pointer]
                  - row [ref=f2e793]:
                    - cell "Honda City ZX CVT 2022 · DL01AB5588 · Petrol 0 photos" [ref=f2e794]:
                      - generic [ref=f2e801]:
                        - generic [ref=f2e802]: Honda City ZX CVT
                        - generic [ref=f2e803]: 2022 · DL01AB5588 · Petrol
                        - generic [ref=f2e804]: 0 photos
                    - cell "25,000 km" [ref=f2e805]
                    - cell "₹ 11,50,000" [ref=f2e806]
                    - cell "30% 1 finding(s)" [ref=f2e807]:
                      - generic [ref=f2e808]: 30%
                      - generic [ref=f2e809]: 1 finding(s)
                    - cell "0/100" [ref=f2e810]
                    - cell "Draft" [ref=f2e812]
                    - cell [ref=f2e817]:
                      - generic [ref=f2e818]:
                        - link "View vehicle" [ref=f2e819]:
                          - /url: /seller/vehicles/v-1793876815307
                        - link "History" [ref=f2e823]:
                          - /url: /seller/history?vehicle=v-1793876815307
                        - link "Documents" [ref=f2e828]:
                          - /url: /seller/documents?vehicle=v-1793876815307
                        - link "Listing" [ref=f2e831]:
                          - /url: /seller/listings?vehicle=v-1793876815307
                        - button "Archive vehicle" [ref=f2e836] [cursor=pointer]
                  - row [ref=f2e840]:
                    - cell "Honda City ZX CVT 2022 · DL01AB6074 · Petrol 0 photos" [ref=f2e841]:
                      - generic [ref=f2e848]:
                        - generic [ref=f2e849]: Honda City ZX CVT
                        - generic [ref=f2e850]: 2022 · DL01AB6074 · Petrol
                        - generic [ref=f2e851]: 0 photos
                    - cell "25,000 km" [ref=f2e852]
                    - cell "₹ 11,50,000" [ref=f2e853]
                    - cell "0% 1 finding(s)" [ref=f2e854]:
                      - generic [ref=f2e855]: 0%
                      - generic [ref=f2e856]: 1 finding(s)
                    - cell "0/100" [ref=f2e857]
                    - cell "Draft" [ref=f2e859]
                    - cell [ref=f2e864]:
                      - generic [ref=f2e865]:
                        - link "View vehicle" [ref=f2e866]:
                          - /url: /seller/vehicles/v-1793876471230
                        - link "History" [ref=f2e870]:
                          - /url: /seller/history?vehicle=v-1793876471230
                        - link "Documents" [ref=f2e875]:
                          - /url: /seller/documents?vehicle=v-1793876471230
                        - link "Listing" [ref=f2e878]:
                          - /url: /seller/listings?vehicle=v-1793876471230
                        - button "Archive vehicle" [ref=f2e883] [cursor=pointer]
                  - row [ref=f2e887]:
                    - cell "2021 BMW 3 Series — representative demo photograph Demo photo BMW 3 Series 330i 2021 · MH01AB1234 · Petrol 3 photos" [ref=f2e888]:
                      - generic [ref=f2e889]:
                        - generic [ref=f2e890]:
                          - img "2021 BMW 3 Series — representative demo photograph" [ref=f2e891]
                          - generic [ref=f2e892]: Demo photo
                        - generic [ref=f2e893]:
                          - generic [ref=f2e894]: BMW 3 Series 330i
                          - generic [ref=f2e895]: 2021 · MH01AB1234 · Petrol
                          - generic [ref=f2e896]: 3 photos
                    - cell "42,000 km" [ref=f2e897]
                    - cell "₹ 26,00,000" [ref=f2e898]
                    - cell "100% 3 finding(s)" [ref=f2e899]:
                      - generic [ref=f2e900]: 100%
                      - generic [ref=f2e901]: 3 finding(s)
                    - cell "40/100" [ref=f2e902]
                    - cell "Published" [ref=f2e904]
                    - cell [ref=f2e909]:
                      - generic [ref=f2e910]:
                        - link "View vehicle" [ref=f2e911]:
                          - /url: /seller/vehicles/v-bmw
                        - link "History" [ref=f2e915]:
                          - /url: /seller/history?vehicle=v-bmw
                        - link "Documents" [ref=f2e920]:
                          - /url: /seller/documents?vehicle=v-bmw
                        - link "Listing" [ref=f2e923]:
                          - /url: /seller/listings?vehicle=v-bmw
                        - button "Archive vehicle" [ref=f2e928] [cursor=pointer]
                  - row [ref=f2e932]:
                    - cell "QA Integration 2021 · MH01AB3617 · petrol 0 photos" [ref=f2e933]:
                      - generic [ref=f2e940]:
                        - generic [ref=f2e941]: QA Integration
                        - generic [ref=f2e942]: 2021 · MH01AB3617 · petrol
                        - generic [ref=f2e943]: 0 photos
                    - cell "0 km" [ref=f2e944]
                    - cell "₹ 0" [ref=f2e945]
                    - cell "0%" [ref=f2e946]
                    - cell "0/100" [ref=f2e948]
                    - cell "Draft" [ref=f2e950]
                    - cell [ref=f2e955]:
                      - generic [ref=f2e956]:
                        - link "View vehicle" [ref=f2e957]:
                          - /url: /seller/vehicles/v-1793869923675
                        - link "History" [ref=f2e961]:
                          - /url: /seller/history?vehicle=v-1793869923675
                        - link "Documents" [ref=f2e966]:
                          - /url: /seller/documents?vehicle=v-1793869923675
                        - link "Listing" [ref=f2e969]:
                          - /url: /seller/listings?vehicle=v-1793869923675
                        - button "Archive vehicle" [ref=f2e974] [cursor=pointer]
                  - row [ref=f2e978]:
                    - cell "QA Integration 2021 · MH01AB8755 · petrol 0 photos" [ref=f2e979]:
                      - generic [ref=f2e986]:
                        - generic [ref=f2e987]: QA Integration
                        - generic [ref=f2e988]: 2021 · MH01AB8755 · petrol
                        - generic [ref=f2e989]: 0 photos
                    - cell "0 km" [ref=f2e990]
                    - cell "₹ 0" [ref=f2e991]
                    - cell "0%" [ref=f2e992]
                    - cell "0/100" [ref=f2e994]
                    - cell "Draft" [ref=f2e996]
                    - cell [ref=f2e1001]:
                      - generic [ref=f2e1002]:
                        - link "View vehicle" [ref=f2e1003]:
                          - /url: /seller/vehicles/v-1793869678811
                        - link "History" [ref=f2e1007]:
                          - /url: /seller/history?vehicle=v-1793869678811
                        - link "Documents" [ref=f2e1012]:
                          - /url: /seller/documents?vehicle=v-1793869678811
                        - link "Listing" [ref=f2e1015]:
                          - /url: /seller/listings?vehicle=v-1793869678811
                        - button "Archive vehicle" [ref=f2e1020] [cursor=pointer]
                  - row [ref=f2e1024]:
                    - cell "2015 BMW 3 Series — representative demo photograph Demo photo BMW 3 Series 320d 2015 · MH01XY4321 · Diesel 1 photo" [ref=f2e1025]:
                      - generic [ref=f2e1026]:
                        - generic [ref=f2e1027]:
                          - img "2015 BMW 3 Series — representative demo photograph" [ref=f2e1028]
                          - generic [ref=f2e1029]: Demo photo
                        - generic [ref=f2e1030]:
                          - generic [ref=f2e1031]: BMW 3 Series 320d
                          - generic [ref=f2e1032]: 2015 · MH01XY4321 · Diesel
                          - generic [ref=f2e1033]: 1 photo
                    - cell "72,450 km" [ref=f2e1034]
                    - cell "₹ 5,80,000" [ref=f2e1035]
                    - cell "92% 3 finding(s)" [ref=f2e1036]:
                      - generic [ref=f2e1037]: 92%
                      - generic [ref=f2e1038]: 3 finding(s)
                    - cell "47/100" [ref=f2e1039]
                    - cell "Published" [ref=f2e1041]
                    - cell [ref=f2e1046]:
                      - generic [ref=f2e1047]:
                        - link "View vehicle" [ref=f2e1048]:
                          - /url: /seller/vehicles/v-seller
                        - link "History" [ref=f2e1052]:
                          - /url: /seller/history?vehicle=v-seller
                        - link "Documents" [ref=f2e1057]:
                          - /url: /seller/documents?vehicle=v-seller
                        - link "Listing" [ref=f2e1060]:
                          - /url: /seller/listings?vehicle=v-seller
                        - button "Archive vehicle" [ref=f2e1065] [cursor=pointer]
                  - row [ref=f2e1069]:
                    - cell "Royal Enfield Continental GT 650 Custom 2021 · MH12BK9900 · Petrol 0 photos" [ref=f2e1070]:
                      - generic [ref=f2e1079]:
                        - generic [ref=f2e1080]: Royal Enfield Continental GT 650 Custom
                        - generic [ref=f2e1081]: 2021 · MH12BK9900 · Petrol
                        - generic [ref=f2e1082]: 0 photos
                    - cell "16,500 km" [ref=f2e1083]
                    - cell "₹ 3,20,000" [ref=f2e1084]
                    - cell "100%" [ref=f2e1085]
                    - cell "100/100" [ref=f2e1087]
                    - cell "Published" [ref=f2e1089]
                    - cell [ref=f2e1094]:
                      - generic [ref=f2e1095]:
                        - link "View vehicle" [ref=f2e1096]:
                          - /url: /seller/vehicles/v-royalenfield
                        - link "History" [ref=f2e1100]:
                          - /url: /seller/history?vehicle=v-royalenfield
                        - link "Documents" [ref=f2e1105]:
                          - /url: /seller/documents?vehicle=v-royalenfield
                        - link "Listing" [ref=f2e1108]:
                          - /url: /seller/listings?vehicle=v-royalenfield
                        - button "Archive vehicle" [ref=f2e1113] [cursor=pointer]
                  - row [ref=f2e1117]:
                    - cell "Toyota Camry Hybrid 2021 · MH12CD8899 · Hybrid 0 photos" [ref=f2e1118]:
                      - generic [ref=f2e1125]:
                        - generic [ref=f2e1126]: Toyota Camry Hybrid
                        - generic [ref=f2e1127]: 2021 · MH12CD8899 · Hybrid
                        - generic [ref=f2e1128]: 0 photos
                    - cell "51,200 km" [ref=f2e1129]
                    - cell "₹ 21,50,000" [ref=f2e1130]
                    - cell "100% 3 finding(s)" [ref=f2e1131]:
                      - generic [ref=f2e1132]: 100%
                      - generic [ref=f2e1133]: 3 finding(s)
                    - cell "42/100" [ref=f2e1134]
                    - cell "Published" [ref=f2e1136]
                    - cell [ref=f2e1141]:
                      - generic [ref=f2e1142]:
                        - link "View vehicle" [ref=f2e1143]:
                          - /url: /seller/vehicles/v-camry
                        - link "History" [ref=f2e1147]:
                          - /url: /seller/history?vehicle=v-camry
                        - link "Documents" [ref=f2e1152]:
                          - /url: /seller/documents?vehicle=v-camry
                        - link "Listing" [ref=f2e1155]:
                          - /url: /seller/listings?vehicle=v-camry
                        - button "Archive vehicle" [ref=f2e1160] [cursor=pointer]
                  - row [ref=f2e1164]:
                    - cell "BMW Motorrad R 1250 GS Triple Black 2021 · MH14DZ1100 · Petrol 0 photos" [ref=f2e1165]:
                      - generic [ref=f2e1174]:
                        - generic [ref=f2e1175]: BMW Motorrad R 1250 GS Triple Black
                        - generic [ref=f2e1176]: 2021 · MH14DZ1100 · Petrol
                        - generic [ref=f2e1177]: 0 photos
                    - cell "22,000 km" [ref=f2e1178]
                    - cell "₹ 20,50,000" [ref=f2e1179]
                    - cell "100%" [ref=f2e1180]
                    - cell "100/100" [ref=f2e1182]
                    - cell "Published" [ref=f2e1184]
                    - cell [ref=f2e1189]:
                      - generic [ref=f2e1190]:
                        - link "View vehicle" [ref=f2e1191]:
                          - /url: /seller/vehicles/v-bmw-bike
                        - link "History" [ref=f2e1195]:
                          - /url: /seller/history?vehicle=v-bmw-bike
                        - link "Documents" [ref=f2e1200]:
                          - /url: /seller/documents?vehicle=v-bmw-bike
                        - link "Listing" [ref=f2e1203]:
                          - /url: /seller/listings?vehicle=v-bmw-bike
                        - button "Archive vehicle" [ref=f2e1208] [cursor=pointer]
                  - row [ref=f2e1212]:
                    - cell "Honda City ZX CVT 2020 · MH04KL2345 · Petrol 0 photos" [ref=f2e1213]:
                      - generic [ref=f2e1220]:
                        - generic [ref=f2e1221]: Honda City ZX CVT
                        - generic [ref=f2e1222]: 2020 · MH04KL2345 · Petrol
                        - generic [ref=f2e1223]: 0 photos
                    - cell "47,000 km" [ref=f2e1224]
                    - cell "₹ 10,50,000" [ref=f2e1225]
                    - cell "100%" [ref=f2e1226]
                    - cell "100/100" [ref=f2e1228]
                    - cell "Published" [ref=f2e1230]
                    - cell [ref=f2e1235]:
                      - generic [ref=f2e1236]:
                        - link "View vehicle" [ref=f2e1237]:
                          - /url: /seller/vehicles/v-honda
                        - link "History" [ref=f2e1241]:
                          - /url: /seller/history?vehicle=v-honda
                        - link "Documents" [ref=f2e1246]:
                          - /url: /seller/documents?vehicle=v-honda
                        - link "Listing" [ref=f2e1249]:
                          - /url: /seller/listings?vehicle=v-honda
                        - button "Archive vehicle" [ref=f2e1254] [cursor=pointer]
            - paragraph [ref=f2e1258]: Duplicate registration numbers and VINs are rejected with a link to the existing record. Archived vehicles keep their verified records for audit.
    - button "Open TrustDrive AI assistant" [ref=f2e1259] [cursor=pointer]
  - alert [ref=f2e1265]
```

# Test source

```ts
  63  |       await expect(page.getByText(/verification/i).first()).toBeVisible();
  64  |     });
  65  | 
  66  |     await test.step("7. Mileage anomaly is shown from seeded readings", async () => {
  67  |       await page.goto("/seller/history");
  68  |       await expect(page.getByText(/mileage|odometer|history/i).first()).toBeVisible();
  69  |     });
  70  | 
  71  |     await test.step("8. Damage / inspection evidence is attached", async () => {
  72  |       await page.goto("/seller/vehicles");
  73  |       await expect(page.getByText(/vehicle/i).first()).toBeVisible();
  74  |     });
  75  | 
  76  |     await test.step("9. AI investigation returns a structured explanation", async () => {
  77  |       await page.goto("/seller/fraud");
  78  |       await expect(page.getByText(/fraud|finding|risk|evidence/i).first()).toBeVisible();
  79  |     });
  80  | 
  81  |     await test.step("10. Seller creates / publishes a listing", async () => {
  82  |       await page.goto("/seller/listings");
  83  |       await expect(page.getByText(/listing/i).first()).toBeVisible();
  84  |     });
  85  | 
  86  |     await test.step("11. Buyer signs in", async () => {
  87  |       await login(page, "buyer");
  88  |     });
  89  | 
  90  |     await test.step("12. Buyer searches the marketplace", async () => {
  91  |       await page.goto("/buyer/explore");
  92  |       await expect(page.getByText(/explore|vehicle/i).first()).toBeVisible();
  93  |     });
  94  | 
  95  |     await test.step("13. Buyer opens the vehicle detail and report", async () => {
  96  |       await page.goto("/vehicle/v-audi");
  97  |       await expect(page.getByText(/audi|trust|report|vehicle/i).first()).toBeVisible();
  98  |     });
  99  | 
  100 |     await test.step("14. Buyer views mileage timeline and evidence", async () => {
  101 |       await page.goto("/buyer/history");
  102 |       await expect(page.getByText(/history|mileage|evidence/i).first()).toBeVisible();
  103 |     });
  104 | 
  105 |     await test.step("15. Buyer opens 3D and selects a mapped component", async () => {
  106 |       await page.goto("/inspection");
  107 |       await expect(page.locator("canvas").or(page.getByText(/WebGL/i))).toBeVisible();
  108 |     });
  109 | 
  110 |     await test.step("16. Buyer compares two vehicles", async () => {
  111 |       await page.goto("/buyer/compare");
  112 |       await expect(page.getByText(/compare/i).first()).toBeVisible();
  113 |     });
  114 | 
  115 |     await test.step("17. Buyer saves the vehicle and contacts the seller", async () => {
  116 |       await page.goto("/buyer/saved");
  117 |       await expect(page.getByText(/saved/i).first()).toBeVisible();
  118 |       await page.goto("/buyer/inquiries");
  119 |       await expect(page.getByText(/inquir/i).first()).toBeVisible();
  120 |     });
  121 | 
  122 |     await test.step("18. Seller responds to the inquiry", async () => {
  123 |       await login(page, "seller");
  124 |       await page.goto("/seller/inquiries");
  125 |       await expect(page.getByText(/inquir/i).first()).toBeVisible();
  126 |     });
  127 | 
  128 |     await test.step("19. Buyer downloads the report", async () => {
  129 |       await login(page, "buyer");
  130 |       await page.goto("/buyer/reports");
  131 |       await expect(page.getByText(/report/i).first()).toBeVisible();
  132 |     });
  133 | 
  134 |     await test.step("20. Public QR page shows only approved summary fields", async () => {
  135 |       // A real token is created by the seller's Share Listing action; this
  136 |       // checks the public route renders a safe response for an unknown token.
  137 |       await page.goto("/verify/unknown-token");
  138 |       await expect(
  139 |         page.getByText(/not found|revoked|invalid|verification/i).first()
  140 |       ).toBeVisible();
  141 |     });
  142 | 
  143 |     await test.step("21. Important actions appear in audit history", async () => {
  144 |       const res = await page.request.get("/api/v1/admin/audit", {
  145 |         headers: { Authorization: "Bearer invalid" },
  146 |       });
  147 |       // 401/403 proves the audit endpoint is protected and present.
  148 |       expect([200, 401, 403]).toContain(res.status());
  149 |     });
  150 |   });
  151 | 
  152 |   test("RBAC: a buyer cannot open a seller-only route", async ({ page }) => {
  153 |     await login(page, "buyer");
  154 |     await page.goto("/seller/vehicles");
  155 |     // The middleware 307 can settle after goto resolves; wait for the redirect.
  156 |     await expect(page).toHaveURL(/\/login/, { timeout: 15000 }).catch(() => {});
  157 |     const redirected = /\/login/.test(new URL(page.url()).pathname);
  158 |     const denied = await page
  159 |       .getByText(/access denied|not authorized|forbidden|sign in/i)
  160 |       .first()
  161 |       .isVisible()
  162 |       .catch(() => false);
> 163 |     expect(redirected || denied).toBeTruthy();
      |                                  ^ Error: expect(received).toBeTruthy()
  164 |   });
  165 | });
  166 | 
```