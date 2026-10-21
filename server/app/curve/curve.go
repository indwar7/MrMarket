// Package curve ports the frontend's seeded random walk so charts match the design.
package curve

func RNG(seed uint32) func() float64 {
	s := seed
	return func() float64 {
		s = s*1664525 + 1013904223
		return float64(s) / 4294967296
	}
}

func Curve(seed uint32, n int, drift, vol float64) []float64 {
	r := RNG(seed)
	v := 100.0
	out := make([]float64, 0, n)
	out = append(out, v)
	for i := 1; i < n; i++ {
		v += drift + (r()-0.5)*vol*2
		out = append(out, v)
	}
	return out
}
