;; Certification Issuance Contract
;; Creates and manages NFT-based sustainability certificates

;; Constants
(define-constant ERR_UNAUTHORIZED (err u400))
(define-constant ERR_CERTIFICATE_NOT_FOUND (err u401))
(define-constant ERR_INVALID_ASSESSMENT (err u402))
(define-constant ERR_CERTIFICATE_EXPIRED (err u403))
(define-constant ERR_TRANSFER_FAILED (err u404))

;; NFT Definition
(define-non-fungible-token sustainability-certificate uint)

;; Data Variables
(define-data-var next-certificate-id uint u1)
(define-data-var contract-owner principal tx-sender)

;; Data Maps
(define-map certificates
  { certificate-id: uint }
  {
    farm-id: uint,
    assessment-id: uint,
    certification-level: (string-ascii 20),
    issue-date: uint,
    expiry-date: uint,
    issuer: principal,
    metadata-uri: (string-ascii 200),
    renewable: bool,
    revoked: bool
  }
)

(define-map farm-certificates
  { farm-id: uint }
  { certificate-ids: (list 10 uint) }
)

(define-map certificate-metadata
  { certificate-id: uint }
  {
    farm-name: (string-ascii 100),
    certification-level: (string-ascii 20),
    sustainability-score: uint,
    practices-verified: uint,
    carbon-footprint: uint,
    water-efficiency: uint
  }
)

;; Public Functions

;; Issue a new sustainability certificate
(define-public (issue-certificate
  (farm-id uint)
  (assessment-id uint)
  (certification-level (string-ascii 20))
  (metadata-uri (string-ascii 200))
  (farm-name (string-ascii 100))
  (sustainability-score uint)
  (practices-verified uint)
  (carbon-footprint uint)
  (water-efficiency uint)
)
  (let ((certificate-id (var-get next-certificate-id)))
    ;; Only contract owner can issue certificates
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_UNAUTHORIZED)

    ;; Mint NFT to farm owner (simplified - would need farm owner lookup)
    (try! (nft-mint? sustainability-certificate certificate-id tx-sender))

    (map-set certificates
      { certificate-id: certificate-id }
      {
        farm-id: farm-id,
        assessment-id: assessment-id,
        certification-level: certification-level,
        issue-date: block-height,
        expiry-date: (+ block-height u52560), ;; 1 year validity
        issuer: tx-sender,
        metadata-uri: metadata-uri,
        renewable: true,
        revoked: false
      }
    )

    (map-set certificate-metadata
      { certificate-id: certificate-id }
      {
        farm-name: farm-name,
        certification-level: certification-level,
        sustainability-score: sustainability-score,
        practices-verified: practices-verified,
        carbon-footprint: carbon-footprint,
        water-efficiency: water-efficiency
      }
    )

    (map-set farm-certificates
      { farm-id: farm-id }
      { certificate-ids: (unwrap-panic (as-max-len? (append (get-certificate-ids-by-farm farm-id) certificate-id) u10)) }
    )

    (var-set next-certificate-id (+ certificate-id u1))
    (ok certificate-id)
  )
)

;; Transfer certificate ownership
(define-public (transfer-certificate (certificate-id uint) (new-owner principal))
  (let ((current-owner (unwrap! (nft-get-owner? sustainability-certificate certificate-id) ERR_CERTIFICATE_NOT_FOUND)))
    (asserts! (is-eq tx-sender current-owner) ERR_UNAUTHORIZED)
    (match (nft-transfer? sustainability-certificate certificate-id current-owner new-owner)
      success (ok true)
      error ERR_TRANSFER_FAILED
    )
  )
)

;; Renew certificate (if renewable and not expired)
(define-public (renew-certificate (certificate-id uint) (new-assessment-id uint))
  (match (map-get? certificates { certificate-id: certificate-id })
    cert-data
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_UNAUTHORIZED)
      (asserts! (get renewable cert-data) ERR_UNAUTHORIZED)
      (asserts! (not (get revoked cert-data)) ERR_UNAUTHORIZED)

      (map-set certificates
        { certificate-id: certificate-id }
        (merge cert-data {
          assessment-id: new-assessment-id,
          expiry-date: (+ block-height u52560),
          issue-date: block-height
        })
      )
      (ok true)
    )
    ERR_CERTIFICATE_NOT_FOUND
  )
)

;; Revoke certificate
(define-public (revoke-certificate (certificate-id uint))
  (match (map-get? certificates { certificate-id: certificate-id })
    cert-data
    (begin
      (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_UNAUTHORIZED)
      (map-set certificates
        { certificate-id: certificate-id }
        (merge cert-data { revoked: true })
      )
      (ok true)
    )
    ERR_CERTIFICATE_NOT_FOUND
  )
)

;; Batch issue certificates
(define-public (batch-issue-certificates (certificates-data (list 5 {
  farm-id: uint,
  assessment-id: uint,
  certification-level: (string-ascii 20),
  metadata-uri: (string-ascii 200),
  farm-name: (string-ascii 100),
  sustainability-score: uint,
  practices-verified: uint,
  carbon-footprint: uint,
  water-efficiency: uint
})))
  (ok (map issue-single-certificate certificates-data))
)

;; Read-only Functions

;; Get certificate details
(define-read-only (get-certificate (certificate-id uint))
  (map-get? certificates { certificate-id: certificate-id })
)

;; Get certificate metadata
(define-read-only (get-certificate-metadata (certificate-id uint))
  (map-get? certificate-metadata { certificate-id: certificate-id })
)

;; Get certificate owner
(define-read-only (get-certificate-owner (certificate-id uint))
  (nft-get-owner? sustainability-certificate certificate-id)
)

;; Get certificates by farm
(define-read-only (get-certificate-ids-by-farm (farm-id uint))
  (default-to (list) (get certificate-ids (map-get? farm-certificates { farm-id: farm-id })))
)

;; Check if certificate is valid
(define-read-only (is-certificate-valid (certificate-id uint))
  (match (map-get? certificates { certificate-id: certificate-id })
    cert-data
    (and
      (> (get expiry-date cert-data) block-height)
      (not (get revoked cert-data))
    )
    false
  )
)

;; Get active certificates for farm
(define-read-only (get-active-certificates (farm-id uint))
  (filter is-certificate-active (get-certificate-ids-by-farm farm-id))
)

;; Get certificate URI for NFT metadata
(define-read-only (get-token-uri (certificate-id uint))
  (match (map-get? certificates { certificate-id: certificate-id })
    cert-data (ok (some (get metadata-uri cert-data)))
    ERR_CERTIFICATE_NOT_FOUND
  )
)

;; Private Functions

;; Helper function for batch issuance
(define-private (issue-single-certificate (cert-data {
  farm-id: uint,
  assessment-id: uint,
  certification-level: (string-ascii 20),
  metadata-uri: (string-ascii 200),
  farm-name: (string-ascii 100),
  sustainability-score: uint,
  practices-verified: uint,
  carbon-footprint: uint,
  water-efficiency: uint
}))
  (issue-certificate
    (get farm-id cert-data)
    (get assessment-id cert-data)
    (get certification-level cert-data)
    (get metadata-uri cert-data)
    (get farm-name cert-data)
    (get sustainability-score cert-data)
    (get practices-verified cert-data)
    (get carbon-footprint cert-data)
    (get water-efficiency cert-data)
  )
)

;; Helper function to check if certificate is active
(define-private (is-certificate-active (certificate-id uint))
  (is-certificate-valid certificate-id)
)
