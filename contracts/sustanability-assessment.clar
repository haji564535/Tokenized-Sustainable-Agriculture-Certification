;; Sustainability Assessment Contract
;; Evaluates environmental impact and calculates sustainability scores

;; Constants
(define-constant ERR_UNAUTHORIZED (err u300))
(define-constant ERR_ASSESSMENT_NOT_FOUND (err u301))
(define-constant ERR_FARM_NOT_FOUND (err u302))
(define-constant ERR_INVALID_SCORE (err u303))

;; Scoring weights (out of 100)
(define-constant WATER_EFFICIENCY_WEIGHT u25)
(define-constant ENERGY_EFFICIENCY_WEIGHT u25)
(define-constant CHEMICAL_REDUCTION_WEIGHT u20)
(define-constant ORGANIC_PRACTICES_WEIGHT u20)
(define-constant BIODIVERSITY_WEIGHT u10)

;; Data Variables
(define-data-var next-assessment-id uint u1)

;; Data Maps
(define-map assessments
  { assessment-id: uint }
  {
    farm-id: uint,
    assessment-date: uint,
    water-efficiency-score: uint,
    energy-efficiency-score: uint,
    chemical-reduction-score: uint,
    organic-practices-score: uint,
    biodiversity-score: uint,
    overall-score: uint,
    certification-level: (string-ascii 20),
    assessor: principal,
    valid-until: uint
  }
)

(define-map farm-assessments
  { farm-id: uint }
  { assessment-ids: (list 20 uint) }
)

(define-map sustainability-metrics
  { farm-id: uint }
  {
    total-water-usage: uint,
    total-energy-usage: uint,
    total-chemical-usage: uint,
    organic-practices-count: uint,
    total-practices-count: uint,
    farm-size: uint
  }
)

;; Public Functions

;; Create sustainability assessment
(define-public (create-assessment
  (farm-id uint)
  (water-efficiency-score uint)
  (energy-efficiency-score uint)
  (chemical-reduction-score uint)
  (organic-practices-score uint)
  (biodiversity-score uint)
)
  (let (
    (assessment-id (var-get next-assessment-id))
    (overall-score (calculate-overall-score
      water-efficiency-score
      energy-efficiency-score
      chemical-reduction-score
      organic-practices-score
      biodiversity-score
    ))
    (cert-level (determine-certification-level overall-score))
  )
    ;; Validate scores (0-100)
    (asserts! (and (<= water-efficiency-score u100) (<= energy-efficiency-score u100)) ERR_INVALID_SCORE)
    (asserts! (and (<= chemical-reduction-score u100) (<= organic-practices-score u100)) ERR_INVALID_SCORE)
    (asserts! (<= biodiversity-score u100) ERR_INVALID_SCORE)

    (map-set assessments
      { assessment-id: assessment-id }
      {
        farm-id: farm-id,
        assessment-date: block-height,
        water-efficiency-score: water-efficiency-score,
        energy-efficiency-score: energy-efficiency-score,
        chemical-reduction-score: chemical-reduction-score,
        organic-practices-score: organic-practices-score,
        biodiversity-score: biodiversity-score,
        overall-score: overall-score,
        certification-level: cert-level,
        assessor: tx-sender,
        valid-until: (+ block-height u52560) ;; Valid for ~1 year
      }
    )

    (map-set farm-assessments
      { farm-id: farm-id }
      { assessment-ids: (unwrap-panic (as-max-len? (append (get-assessment-ids-by-farm farm-id) assessment-id) u20)) }
    )

    (var-set next-assessment-id (+ assessment-id u1))
    (ok assessment-id)
  )
)

;; Update farm sustainability metrics
(define-public (update-farm-metrics
  (farm-id uint)
  (total-water-usage uint)
  (total-energy-usage uint)
  (total-chemical-usage uint)
  (organic-practices-count uint)
  (total-practices-count uint)
  (farm-size uint)
)
  (begin
    (map-set sustainability-metrics
      { farm-id: farm-id }
      {
        total-water-usage: total-water-usage,
        total-energy-usage: total-energy-usage,
        total-chemical-usage: total-chemical-usage,
        organic-practices-count: organic-practices-count,
        total-practices-count: total-practices-count,
        farm-size: farm-size
      }
    )
    (ok true)
  )
)

;; Calculate automated assessment based on practices
(define-public (calculate-automated-assessment (farm-id uint))
  (match (map-get? sustainability-metrics { farm-id: farm-id })
    metrics
    (let (
      (water-score (calculate-water-efficiency-score metrics))
      (energy-score (calculate-energy-efficiency-score metrics))
      (chemical-score (calculate-chemical-reduction-score metrics))
      (organic-score (calculate-organic-practices-score metrics))
      (biodiversity-score u75) ;; Default biodiversity score
    )
      (create-assessment farm-id water-score energy-score chemical-score organic-score biodiversity-score)
    )
    ERR_FARM_NOT_FOUND
  )
)

;; Read-only Functions

;; Get assessment details
(define-read-only (get-assessment (assessment-id uint))
  (map-get? assessments { assessment-id: assessment-id })
)

;; Get latest assessment for farm
(define-read-only (get-latest-assessment (farm-id uint))
  (let ((assessment-ids (get-assessment-ids-by-farm farm-id)))
    (if (> (len assessment-ids) u0)
      (map-get? assessments { assessment-id: (unwrap-panic (element-at assessment-ids (- (len assessment-ids) u1))) })
      none
    )
  )
)

;; Get assessments by farm
(define-read-only (get-assessment-ids-by-farm (farm-id uint))
  (default-to (list) (get assessment-ids (map-get? farm-assessments { farm-id: farm-id })))
)

;; Get farm sustainability metrics
(define-read-only (get-farm-metrics (farm-id uint))
  (map-get? sustainability-metrics { farm-id: farm-id })
)

;; Check if assessment is valid
(define-read-only (is-assessment-valid (assessment-id uint))
  (match (map-get? assessments { assessment-id: assessment-id })
    assessment-data (> (get valid-until assessment-data) block-height)
    false
  )
)

;; Private Functions

;; Calculate overall sustainability score
(define-private (calculate-overall-score
  (water-score uint)
  (energy-score uint)
  (chemical-score uint)
  (organic-score uint)
  (biodiversity-score uint)
)
  (/ (+
    (* water-score WATER_EFFICIENCY_WEIGHT)
    (* energy-score ENERGY_EFFICIENCY_WEIGHT)
    (* chemical-score CHEMICAL_REDUCTION_WEIGHT)
    (* organic-score ORGANIC_PRACTICES_WEIGHT)
    (* biodiversity-score BIODIVERSITY_WEIGHT)
  ) u100)
)

;; Determine certification level based on score
(define-private (determine-certification-level (score uint))
  (if (>= score u90)
    "platinum"
    (if (>= score u80)
      "gold"
      (if (>= score u70)
        "silver"
        (if (>= score u60)
          "bronze"
          "basic"
        )
      )
    )
  )
)

;; Calculate water efficiency score
(define-private (calculate-water-efficiency-score (metrics {
  total-water-usage: uint,
  total-energy-usage: uint,
  total-chemical-usage: uint,
  organic-practices-count: uint,
  total-practices-count: uint,
  farm-size: uint
}))
  (let ((water-per-hectare (/ (get total-water-usage metrics) (get farm-size metrics))))
    (if (<= water-per-hectare u1000)
      u100
      (if (<= water-per-hectare u2000)
        u80
        (if (<= water-per-hectare u3000)
          u60
          u40
        )
      )
    )
  )
)

;; Calculate energy efficiency score
(define-private (calculate-energy-efficiency-score (metrics {
  total-water-usage: uint,
  total-energy-usage: uint,
  total-chemical-usage: uint,
  organic-practices-count: uint,
  total-practices-count: uint,
  farm-size: uint
}))
  (let ((energy-per-hectare (/ (get total-energy-usage metrics) (get farm-size metrics))))
    (if (<= energy-per-hectare u500)
      u100
      (if (<= energy-per-hectare u1000)
        u80
        (if (<= energy-per-hectare u1500)
          u60
          u40
        )
      )
    )
  )
)

;; Calculate chemical reduction score
(define-private (calculate-chemical-reduction-score (metrics {
  total-water-usage: uint,
  total-energy-usage: uint,
  total-chemical-usage: uint,
  organic-practices-count: uint,
  total-practices-count: uint,
  farm-size: uint
}))
  (let ((chemical-per-hectare (/ (get total-chemical-usage metrics) (get farm-size metrics))))
    (if (is-eq chemical-per-hectare u0)
      u100
      (if (<= chemical-per-hectare u10)
        u80
        (if (<= chemical-per-hectare u25)
          u60
          u40
        )
      )
    )
  )
)

;; Calculate organic practices score
(define-private (calculate-organic-practices-score (metrics {
  total-water-usage: uint,
  total-energy-usage: uint,
  total-chemical-usage: uint,
  organic-practices-count: uint,
  total-practices-count: uint,
  farm-size: uint
}))
  (if (> (get total-practices-count metrics) u0)
    (/ (* (get organic-practices-count metrics) u100) (get total-practices-count metrics))
    u0
  )
)
